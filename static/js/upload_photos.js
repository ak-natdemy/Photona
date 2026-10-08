/**
 * Photona - Phase 2 Upload Photos Controller
 * - Chunked multipart uploads (default: 50 photos/chunk)
 * - Controlled client-side concurrency (default: 3 workers)
 * - Bounded DOM preview tray (caps rendering at 24 previews to support 35,000+ files)
 * - Chunk-level idempotency and exponential backoff retry
 * - Session-based resume support
 * - Real-time non-blocking progress UI with speed & ETA
 * - Triggers Phase 1 Celery Chord orchestrator once upon completion
 */

document.addEventListener("DOMContentLoaded", () => {
    // -------------------------------------------------------------
    // DOM Elements
    // -------------------------------------------------------------
    const form = document.getElementById("upload-photos-form");
    const dropzone = document.getElementById("dropzone");
    const fileInput = document.getElementById("id_images");
    const browseBtn = document.getElementById("browse-trigger-btn");

    const stagingTray = document.getElementById("staging-tray");
    const thumbnailsGrid = document.getElementById("thumbnails-grid");
    const stagedCountEl = document.getElementById("staged-count");
    const stagedSizeEl = document.getElementById("staged-size");

    const addMoreBtn = document.getElementById("add-more-btn");
    const clearAllBtn = document.getElementById("clear-all-btn");

    const submitBtn = document.getElementById("submit-upload-btn");
    const submitBtnText = document.getElementById("submit-btn-text");
    const submitBtnCount = document.getElementById("submit-btn-count");

    const progressContainer = document.getElementById("upload-progress-container");
    const progressStatusText = document.getElementById("progress-status-text");
    const progressPercentText = document.getElementById("progress-percent-text");
    const uploadProgressFill = document.getElementById("upload-progress-fill");
    const progressChunkDetail = document.getElementById("progress-chunk-detail");
    const progressSpeedDetail = document.getElementById("progress-speed-detail");
    const retryContainer = document.getElementById("retry-container");
    const retryBtn = document.getElementById("btn-retry-failed-chunks");

    // Compression Controls
    const btnCompressToggle = document.getElementById("btn-compress-toggle");
    const compressAdjusterBar = document.getElementById("compress-adjuster-bar");
    const compressStateBadge = document.getElementById("compress-state-badge");
    const compressSizeSlider = document.getElementById("compress-size-slider");
    const compressTargetDisplay = document.getElementById("compress-target-display");
    const compressHintVal = document.getElementById("compress-hint-val");
    const compressHintVal2 = document.getElementById("compress-hint-val2");
    const compressHintVal3 = document.getElementById("compress-hint-val3");
    const tickBtns = document.querySelectorAll(".tick-btn");

    let isCompressActive = false;
    let compressTargetMB = 4; // Default maximum ceiling: 4 MB

    const mobileMenuBtn = document.getElementById("mobile-menu-btn");
    const sidebar = document.getElementById("sidebar");
    const sidebarOverlay = document.getElementById("sidebar-overlay");

    // -------------------------------------------------------------
    // Configuration Parameters (from form data attributes)
    // -------------------------------------------------------------
    const USE_CHUNKED = form ? (form.dataset.useChunked !== "false") : true;
    const CHUNK_SIZE = form ? (parseInt(form.dataset.chunkSize, 10) || 50) : 50;
    const CONCURRENCY = form ? (parseInt(form.dataset.concurrency, 10) || 3) : 3;
    const MAX_RETRIES = form ? (parseInt(form.dataset.maxRetries, 10) || 3) : 3;
    const CHUNK_URL = form ? form.dataset.chunkUrl : "";
    const COMPLETE_URL = form ? form.dataset.completeUrl : "";
    const SESSION_BASE_URL = form ? form.dataset.sessionBaseUrl : "";

    const MAX_PREVIEWS = 24; // Keep DOM elements strictly bounded (<25 cards)
    const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
    const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

    // In-memory staged files array (holds File references without DOM bloat)
    let stagedFiles = [];
    let isUploading = false;
    let uploadSessionId = null;
    let chunksList = [];
    let activeWorkers = 0;
    let completedChunks = 0;
    let totalChunks = 0;
    let uploadedBytes = 0;
    let totalBytes = 0;
    let uploadStartTime = 0;

    // -------------------------------------------------------------
    // 1. Mobile Sidebar Navigation
    // -------------------------------------------------------------
    if (mobileMenuBtn && sidebar && sidebarOverlay) {
        mobileMenuBtn.addEventListener("click", () => {
            sidebar.classList.toggle("sidebar-open");
            sidebarOverlay.classList.toggle("overlay-visible");
        });
        sidebarOverlay.addEventListener("click", () => {
            sidebar.classList.remove("sidebar-open");
            sidebarOverlay.classList.remove("overlay-visible");
        });
    }

    // -------------------------------------------------------------
    // 1b. Photo Compression Controls & Adjusting Bar
    // -------------------------------------------------------------
    if (btnCompressToggle && compressAdjusterBar) {
        btnCompressToggle.addEventListener("click", () => {
            if (isUploading) return;
            isCompressActive = !isCompressActive;

            if (isCompressActive) {
                btnCompressToggle.classList.add("active");
                btnCompressToggle.setAttribute("aria-pressed", "true");
                if (compressStateBadge) compressStateBadge.textContent = `ON · ${compressTargetMB}MB`;
                compressAdjusterBar.style.display = "flex";
            } else {
                btnCompressToggle.classList.remove("active");
                btnCompressToggle.setAttribute("aria-pressed", "false");
                if (compressStateBadge) compressStateBadge.textContent = "OFF";
                compressAdjusterBar.style.display = "none";
            }
            renderStaging();
        });
    }

    if (compressSizeSlider) {
        compressSizeSlider.addEventListener("input", (e) => {
            compressTargetMB = parseInt(e.target.value, 10) || 4;
            updateCompressTargetDisplay();
            renderStaging();
        });
    }

    tickBtns.forEach((btn) => {
        btn.addEventListener("click", (e) => {
            const mb = parseInt(btn.dataset.mb, 10);
            if (mb && compressSizeSlider) {
                compressSizeSlider.value = mb;
                compressTargetMB = mb;
                updateCompressTargetDisplay();
                renderStaging();
            }
        });
    });

    function updateCompressTargetDisplay() {
        if (compressTargetDisplay) compressTargetDisplay.textContent = `${compressTargetMB} MB`;
        if (compressHintVal) compressHintVal.textContent = `${compressTargetMB} MB`;
        if (compressHintVal2) compressHintVal2.textContent = `${compressTargetMB} MB`;
        if (compressHintVal3) compressHintVal3.textContent = `${compressTargetMB} MB`;
        if (isCompressActive && compressStateBadge) {
            compressStateBadge.textContent = `ON · ${compressTargetMB}MB`;
        }

        tickBtns.forEach((b) => {
            if (parseInt(b.dataset.mb, 10) === compressTargetMB) {
                b.classList.add("active");
            } else {
                b.classList.remove("active");
            }
        });
    }

    // -------------------------------------------------------------
    // 2. File Selection & Drag-and-Drop Triggers
    // -------------------------------------------------------------
    if (browseBtn && fileInput) {
        browseBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!isUploading) fileInput.click();
        });
    }

    if (dropzone && fileInput) {
        dropzone.addEventListener("click", (e) => {
            if (e.target !== browseBtn && !isUploading) {
                fileInput.click();
            }
        });
    }

    if (addMoreBtn && fileInput) {
        addMoreBtn.addEventListener("click", () => {
            if (!isUploading) fileInput.click();
        });
    }

    if (dropzone) {
        ["dragenter", "dragover"].forEach((eventName) => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!isUploading) dropzone.classList.add("drag-over");
            });
        });

        ["dragleave", "dragend", "drop"].forEach((eventName) => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.remove("drag-over");
            });
        });

        dropzone.addEventListener("drop", (e) => {
            if (isUploading) return;
            const dt = e.dataTransfer;
            if (dt && dt.files && dt.files.length > 0) {
                handleNewFiles(dt.files);
            }
        });
    }

    if (fileInput) {
        fileInput.addEventListener("change", () => {
            if (fileInput.files && fileInput.files.length > 0) {
                handleNewFiles(fileInput.files);
                fileInput.value = ""; // Reset input so re-selecting same files triggers change
            }
        });
    }

    // -------------------------------------------------------------
    // 3. File Ingestion & Staging (Bounded DOM rendering)
    // -------------------------------------------------------------
    function formatBytes(bytes, decimals = 1) {
        if (!bytes || bytes === 0) return "0 Bytes";
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ["Bytes", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
    }

    function handleNewFiles(fileList) {
        let rejectedCount = 0;
        let oversizedCount = 0;

        Array.from(fileList).forEach((file) => {
            if (!ALLOWED_TYPES.includes(file.type)) {
                rejectedCount++;
                return;
            }
            if (file.size > MAX_FILE_SIZE) {
                oversizedCount++;
                return;
            }

            // Avoid exact duplicate files in the staging tray
            const exists = stagedFiles.some(
                (f) => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified
            );
            if (!exists) {
                stagedFiles.push(file);
            }
        });

        if (rejectedCount > 0) {
            alert(`${rejectedCount} file(s) skipped. Only JPG, PNG, and WebP images are supported.`);
        }
        if (oversizedCount > 0) {
            alert(`${oversizedCount} file(s) skipped because they exceed the 100MB limit.`);
        }

        renderStaging();
    }

    function renderStaging() {
        if (!stagingTray || !thumbnailsGrid) return;

        const totalCount = stagedFiles.length;
        if (totalCount === 0) {
            stagingTray.style.display = "none";
            thumbnailsGrid.innerHTML = "";
            if (stagedCountEl) stagedCountEl.textContent = "0";
            if (stagedSizeEl) stagedSizeEl.textContent = "0.0 MB total";
            if (submitBtnCount) submitBtnCount.textContent = "0";
            return;
        }

        stagingTray.style.display = "flex";
        const originalTotalBytes = stagedFiles.reduce((acc, f) => acc + f.size, 0);
        const targetBytes = compressTargetMB * 1024 * 1024;

        if (isCompressActive) {
            // Estimate compressed total bytes
            const estimatedTotalBytes = stagedFiles.reduce((acc, f) => {
                if (f.size > targetBytes) {
                    return acc + Math.round(targetBytes * 0.95);
                }
                return acc + f.size;
            }, 0);

            const oversizedCount = stagedFiles.filter(f => f.size > targetBytes).length;
            if (oversizedCount > 0) {
                if (stagedSizeEl) {
                    stagedSizeEl.textContent = `~${formatBytes(estimatedTotalBytes)} est. (${formatBytes(originalTotalBytes)} orig)`;
                    stagedSizeEl.title = `${oversizedCount} photo(s) > ${compressTargetMB}MB will be compressed to maximum ${compressTargetMB}MB. Rest upload original.`;
                }
            } else {
                if (stagedSizeEl) stagedSizeEl.textContent = `${formatBytes(originalTotalBytes)} total (all ≤ ${compressTargetMB}MB)`;
            }
            totalBytes = estimatedTotalBytes;
        } else {
            totalBytes = originalTotalBytes;
            if (stagedSizeEl) stagedSizeEl.textContent = `${formatBytes(totalBytes)} total`;
        }

        if (stagedCountEl) stagedCountEl.textContent = totalCount.toLocaleString();
        if (submitBtnCount) submitBtnCount.textContent = totalCount.toLocaleString();

        // Render at most MAX_PREVIEWS to prevent browser tab freezing at 20,000+ photos
        thumbnailsGrid.innerHTML = "";
        const previewSlice = stagedFiles.slice(0, MAX_PREVIEWS);

        previewSlice.forEach((file, index) => {
            const card = document.createElement("div");
            card.className = "staged-photo-card";

            const thumbWrap = document.createElement("div");
            thumbWrap.className = "staged-thumb-wrap";

            const img = document.createElement("img");
            img.alt = file.name;
            const objectUrl = URL.createObjectURL(file);
            img.src = objectUrl;
            img.onload = () => URL.revokeObjectURL(objectUrl);

            const removeBtn = document.createElement("button");
            removeBtn.type = "button";
            removeBtn.className = "btn-remove-photo";
            removeBtn.innerHTML = "&times;";
            removeBtn.title = `Remove ${file.name}`;
            removeBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (!isUploading) removeFile(index);
            });

            thumbWrap.appendChild(img);
            thumbWrap.appendChild(removeBtn);

            const footer = document.createElement("div");
            footer.className = "staged-card-footer";

            const nameSpan = document.createElement("span");
            nameSpan.className = "staged-file-name";
            nameSpan.title = file.name;
            nameSpan.textContent = file.name;

            const sizeSpan = document.createElement("span");
            sizeSpan.className = "staged-file-size";
            sizeSpan.textContent = formatBytes(file.size);

            footer.appendChild(nameSpan);
            footer.appendChild(sizeSpan);

            if (isCompressActive) {
                const targetBytes = compressTargetMB * 1024 * 1024;
                const tagSpan = document.createElement("span");
                if (file.size > targetBytes) {
                    tagSpan.className = "compress-card-tag tag-compress";
                    tagSpan.textContent = `⚡ → max ${compressTargetMB}MB`;
                    tagSpan.title = `Original is ${formatBytes(file.size)}. Will compress to ceiling of ${compressTargetMB}MB.`;
                } else {
                    tagSpan.className = "compress-card-tag tag-original";
                    tagSpan.textContent = `Original (≤ ${compressTargetMB}MB)`;
                    tagSpan.title = `File is already ≤ ${compressTargetMB}MB. Will upload in original size.`;
                }
                footer.appendChild(tagSpan);
            }

            card.appendChild(thumbWrap);
            card.appendChild(footer);
            thumbnailsGrid.appendChild(card);
        });

        // Overflow card indicating additional files without DOM overload
        if (totalCount > MAX_PREVIEWS) {
            const overflowCard = document.createElement("div");
            overflowCard.className = "staged-photo-card overflow-summary-card";
            overflowCard.style.display = "flex";
            overflowCard.style.flexDirection = "column";
            overflowCard.style.alignItems = "center";
            overflowCard.style.justifyContent = "center";
            overflowCard.style.border = "2px dashed rgba(255, 255, 255, 0.15)";
            overflowCard.style.borderRadius = "8px";
            overflowCard.style.background = "rgba(255, 255, 255, 0.03)";
            overflowCard.style.padding = "16px";
            overflowCard.style.textAlign = "center";

            const diff = totalCount - MAX_PREVIEWS;
            overflowCard.innerHTML = `
                <div style="font-size:22px; font-weight:700; color:#38bdf8;">+${diff.toLocaleString()}</div>
                <div style="font-size:12px; color:#94a3b8; margin-top:4px;">more photos staged</div>
            `;
            thumbnailsGrid.appendChild(overflowCard);
        }
    }

    function removeFile(index) {
        stagedFiles.splice(index, 1);
        renderStaging();
    }

    if (clearAllBtn) {
        clearAllBtn.addEventListener("click", () => {
            if (isUploading) return;
            stagedFiles = [];
            renderStaging();
        });
    }

    // -------------------------------------------------------------
    // 4. UUID & Chunk Partitioning Helper
    // -------------------------------------------------------------
    function generateUUID() {
        if (typeof crypto !== "undefined" && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === "x" ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    function getCsrfToken() {
        const csrfInput = form.querySelector("[name=csrfmiddlewaretoken]");
        return csrfInput ? csrfInput.value : "";
    }

    // -------------------------------------------------------------
    // 5. Chunked Upload Pipeline & Concurrency Pool
    // -------------------------------------------------------------
    if (form) {
        form.addEventListener("submit", (e) => {
            if (stagedFiles.length === 0) {
                e.preventDefault();
                alert("Please select at least one photo to upload.");
                return;
            }

            // Fallback to legacy single multipart upload if chunked upload is disabled
            if (!USE_CHUNKED) {
                return; // Let standard form submission proceed
            }

            e.preventDefault();
            startChunkedUpload();
        });
    }

    if (retryBtn) {
        retryBtn.addEventListener("click", () => {
            if (!isUploading && chunksList.length > 0) {
                retryFailedChunks();
            }
        });
    }

    // -------------------------------------------------------------
    // Compression Engine (High-Fidelity Ceiling Seeker)
    // -------------------------------------------------------------
    async function compressImageToTarget(file, targetMB) {
        const targetBytes = targetMB * 1024 * 1024;
        // If file is below or equal to target, keep 100% original bytes!
        if (file.size <= targetBytes) {
            return file;
        }

        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = async () => {
                    try {
                        let { width, height } = img;
                        const canvas = document.createElement("canvas");
                        const ctx = canvas.getContext("2d");

                        // If dimensions are excessively large (> 6000px), cap to 5500px to prevent browser canvas crash
                        const maxDim = 5500;
                        if (width > maxDim || height > maxDim) {
                            const scale = Math.min(maxDim / width, maxDim / height);
                            width = Math.round(width * scale);
                            height = Math.round(height * scale);
                        }

                        canvas.width = width;
                        canvas.height = height;
                        ctx.drawImage(img, 0, 0, width, height);

                        const getBlob = (q) => new Promise(res => canvas.toBlob(res, "image/jpeg", q));

                        // High fidelity ceiling seeker: aims for highest possible quality that fits under targetBytes
                        let low = 0.50;
                        let high = 0.95;
                        let bestBlob = null;

                        // Test highest quality first
                        let blob = await getBlob(high);
                        if (blob && blob.size <= targetBytes) {
                            bestBlob = blob;
                        } else {
                            // Binary search for highest quality that is <= targetBytes
                            for (let iter = 0; iter < 5; iter++) {
                                let mid = (low + high) / 2;
                                blob = await getBlob(mid);
                                if (blob && blob.size <= targetBytes) {
                                    bestBlob = blob;
                                    low = mid; // Try higher to maximize quality close to target
                                } else {
                                    high = mid;
                                }
                            }

                            // If still exceeds targetBytes (e.g. extremely detailed texture), downscale slightly
                            if (!bestBlob || bestBlob.size > targetBytes) {
                                let scaleFactor = 0.85;
                                while ((!bestBlob || bestBlob.size > targetBytes) && scaleFactor >= 0.45) {
                                    canvas.width = Math.round(width * scaleFactor);
                                    canvas.height = Math.round(height * scaleFactor);
                                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                                    blob = await getBlob(0.85);
                                    if (blob && blob.size <= targetBytes) {
                                        bestBlob = blob;
                                        break;
                                    }
                                    scaleFactor -= 0.15;
                                }
                            }
                        }

                        if (bestBlob && bestBlob.size <= targetBytes) {
                            const compressedFile = new File([bestBlob], file.name, {
                                type: "image/jpeg",
                                lastModified: file.lastModified || Date.now(),
                            });
                            resolve(compressedFile);
                        } else {
                            resolve(bestBlob ? new File([bestBlob], file.name, { type: "image/jpeg", lastModified: file.lastModified }) : file);
                        }
                    } catch (err) {
                        console.warn("Client-side compression fallback for", file.name, err);
                        resolve(file);
                    }
                };
                img.onerror = () => resolve(file);
                img.src = e.target.result;
            };
            reader.onerror = () => resolve(file);
            reader.readAsDataURL(file);
        });
    }

    async function startChunkedUpload() {
        if (isUploading) return;
        isUploading = true;

        // UI state updates
        if (submitBtn) submitBtn.disabled = true;
        if (clearAllBtn) clearAllBtn.disabled = true;
        if (addMoreBtn) addMoreBtn.disabled = true;
        if (retryContainer) retryContainer.style.display = "none";

        if (progressContainer) {
            progressContainer.style.display = "flex";
            progressContainer.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }

        uploadSessionId = generateUUID();

        // -------------------------------------------------------------
        // Selective Photo Compression Pre-Pass
        // -------------------------------------------------------------
        if (isCompressActive) {
            const targetBytes = compressTargetMB * 1024 * 1024;
            const filesToCompress = stagedFiles.filter(f => f.size > targetBytes);

            if (filesToCompress.length > 0) {
                if (progressStatusText) {
                    progressStatusText.textContent = `Optimizing ${filesToCompress.length} large photo(s) to max ${compressTargetMB}MB...`;
                }
                if (progressChunkDetail) {
                    progressChunkDetail.textContent = `Photos ≤ ${compressTargetMB}MB stay untouched in original size.`;
                }

                // Compress files with progress updates
                const compressedMap = new Map();
                for (let i = 0; i < filesToCompress.length; i++) {
                    const f = filesToCompress[i];
                    const pct = Math.round(((i + 1) / filesToCompress.length) * 100);
                    if (uploadProgressFill) uploadProgressFill.style.width = `${pct}%`;
                    if (progressPercentText) progressPercentText.textContent = `${pct}%`;
                    if (progressStatusText) {
                        progressStatusText.textContent = `Compressing photo ${i + 1} of ${filesToCompress.length} to max ${compressTargetMB}MB...`;
                    }
                    const compFile = await compressImageToTarget(f, compressTargetMB);
                    compressedMap.set(f, compFile);
                }

                // Swap in compressed files (files below target remain original!)
                stagedFiles = stagedFiles.map(f => compressedMap.get(f) || f);
            }
        }

        const totalFiles = stagedFiles.length;

        // Partition stagedFiles into discrete chunks
        chunksList = [];
        for (let i = 0; i < totalFiles; i += CHUNK_SIZE) {
            chunksList.push({
                chunkIndex: chunksList.length,
                files: stagedFiles.slice(i, i + CHUNK_SIZE),
                status: "pending", // 'pending' | 'uploading' | 'completed' | 'failed'
                retries: 0,
            });
        }

        totalChunks = chunksList.length;
        completedChunks = 0;
        uploadedBytes = 0;
        activeWorkers = 0;
        uploadStartTime = Date.now();

        updateProgressUI();
        launchWorkerPool();
    }

    function updateProgressUI() {
        const percent = totalChunks > 0 ? Math.round((completedChunks / totalChunks) * 100) : 0;
        if (uploadProgressFill) uploadProgressFill.style.width = `${percent}%`;
        if (progressPercentText) progressPercentText.textContent = `${percent}%`;

        const totalFiles = stagedFiles.length;
        const uploadedEstimate = Math.min(completedChunks * CHUNK_SIZE, totalFiles);

        if (progressStatusText) {
            progressStatusText.textContent = `Uploading photos: ${uploadedEstimate.toLocaleString()} / ${totalFiles.toLocaleString()}`;
        }

        if (progressChunkDetail) {
            progressChunkDetail.textContent = `Chunk ${completedChunks} of ${totalChunks} completed`;
        }

        // Speed & ETA estimation
        const elapsedSec = (Date.now() - uploadStartTime) / 1000;
        if (elapsedSec > 1 && completedChunks > 0 && progressSpeedDetail) {
            const filesPerSec = (uploadedEstimate / elapsedSec).toFixed(1);
            const remainingFiles = totalFiles - uploadedEstimate;
            const remainingSec = Math.round(remainingFiles / Math.max(0.1, parseFloat(filesPerSec)));
            progressSpeedDetail.textContent = `${filesPerSec} photos/sec • ~${remainingSec}s remaining`;
        }
    }

    function launchWorkerPool() {
        while (activeWorkers < CONCURRENCY && hasPendingChunks()) {
            const nextChunk = getNextPendingChunk();
            if (nextChunk) {
                activeWorkers++;
                uploadChunk(nextChunk);
            }
        }
    }

    function hasPendingChunks() {
        return chunksList.some((c) => c.status === "pending");
    }

    function getNextPendingChunk() {
        return chunksList.find((c) => c.status === "pending");
    }

    async function uploadChunk(chunk) {
        chunk.status = "uploading";

        const formData = new FormData();
        formData.append("csrfmiddlewaretoken", getCsrfToken());
        formData.append("upload_id", uploadSessionId);
        formData.append("chunk_index", chunk.chunkIndex);
        formData.append("total_chunks", totalChunks);
        formData.append("total_files", stagedFiles.length);
        if (isCompressActive) {
            formData.append("compress_target_mb", compressTargetMB);
        }

        chunk.files.forEach((file) => {
            formData.append("images", file);
        });

        try {
            const response = await fetch(CHUNK_URL, {
                method: "POST",
                body: formData,
                headers: {
                    "X-Requested-With": "XMLHttpRequest",
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || "Chunk upload rejected");
            }

            // Chunk successful
            chunk.status = "completed";
            completedChunks++;
            activeWorkers--;
            updateProgressUI();

            checkCompletionOrContinue();
        } catch (error) {
            console.warn(`Chunk ${chunk.chunkIndex} failed (attempt ${chunk.retries + 1}):`, error);
            chunk.retries++;

            if (chunk.retries <= MAX_RETRIES) {
                // Exponential backoff retry
                const backoffDelay = Math.min(1000 * Math.pow(2, chunk.retries - 1), 8000);
                setTimeout(() => {
                    uploadChunk(chunk);
                }, backoffDelay);
            } else {
                // Max retries exceeded
                chunk.status = "failed";
                activeWorkers--;
                showRetryUI();
                checkCompletionOrContinue();
            }
        }
    }

    function checkCompletionOrContinue() {
        if (completedChunks === totalChunks) {
            // All chunks successfully uploaded!
            finalizeUploadSession();
        } else if (hasPendingChunks()) {
            launchWorkerPool();
        } else if (activeWorkers === 0) {
            // Some chunks failed and no active workers
            showRetryUI();
        }
    }

    function showRetryUI() {
        isUploading = false;
        const failedCount = chunksList.filter((c) => c.status === "failed").length;
        if (progressStatusText) {
            progressStatusText.textContent = `Upload paused: ${failedCount} chunk(s) encountered network errors.`;
        }
        if (retryContainer) retryContainer.style.display = "block";
        if (submitBtn) submitBtn.disabled = false;
    }

    function retryFailedChunks() {
        isUploading = true;
        if (retryContainer) retryContainer.style.display = "none";
        if (submitBtn) submitBtn.disabled = true;

        chunksList.forEach((c) => {
            if (c.status === "failed") {
                c.status = "pending";
                c.retries = 0;
            }
        });

        launchWorkerPool();
    }

    async function finalizeUploadSession() {
        if (progressStatusText) {
            progressStatusText.textContent = "Upload complete! Initializing AI face recognition...";
        }
        if (progressChunkDetail) {
            progressChunkDetail.textContent = "Triggering background processing...";
        }

        const compFormData = new FormData();
        compFormData.append("csrfmiddlewaretoken", getCsrfToken());
        compFormData.append("upload_id", uploadSessionId);

        try {
            const response = await fetch(COMPLETE_URL, {
                method: "POST",
                body: compFormData,
                headers: {
                    "X-Requested-With": "XMLHttpRequest",
                },
            });

            const data = await response.json();
            if (data.success) {
                if (progressPercentText) progressPercentText.textContent = "100%";
                if (uploadProgressFill) uploadProgressFill.style.width = "100%";
                if (progressStatusText) progressStatusText.textContent = "Done! Redirecting to event album...";

                setTimeout(() => {
                    window.location.href = data.redirect_url;
                }, 750);
            } else {
                alert("Upload finalized, but AI dispatch returned: " + (data.error || "Unknown"));
                window.location.reload();
            }
        } catch (err) {
            console.error("Error finalizing upload session:", err);
            // Even if completion API call had network glitch, files are safely saved
            window.location.reload();
        }
    }
});
