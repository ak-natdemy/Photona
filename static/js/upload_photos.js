/**
 * Photona - Upload Photos Controller
 * - Drag-and-drop file upload zone
 * - Cumulative multi-file staging with DataTransfer API
 * - Instant thumbnail previews with individual remove triggers
 * - Client-side validation for file type & 20MB size limits
 * - Double-submission prevention & animated upload progress
 * - Mobile sidebar navigation drawer
 */

document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements
    const dropzone = document.getElementById("dropzone");
    const fileInput = document.getElementById("id_images");
    const browseBtn = document.getElementById("browse-trigger-btn");

    const stagingTray = document.getElementById("staging-tray");
    const thumbnailsGrid = document.getElementById("thumbnails-grid");
    const stagedCountEl = document.getElementById("staged-count");
    const stagedSizeEl = document.getElementById("staged-size");

    const addMoreBtn = document.getElementById("add-more-btn");
    const clearAllBtn = document.getElementById("clear-all-btn");

    const form = document.getElementById("upload-photos-form");
    const submitBtn = document.getElementById("submit-upload-btn");
    const submitBtnText = document.getElementById("submit-btn-text");
    const submitBtnCount = document.getElementById("submit-btn-count");
    const progressContainer = document.getElementById("upload-progress-container");

    const mobileMenuBtn = document.getElementById("mobile-menu-btn");
    const sidebar = document.getElementById("sidebar");
    const sidebarOverlay = document.getElementById("sidebar-overlay");

    // Cumulative file list using DataTransfer
    let stagedFiles = [];
    const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
    const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

    // ============================================================
    // 1. MOBILE SIDEBAR NAVIGATION
    // ============================================================
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

    // ============================================================
    // 2. TRIGGER FILE BROWSER
    // ============================================================
    if (browseBtn && fileInput) {
        browseBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            fileInput.click();
        });
    }

    if (dropzone && fileInput) {
        dropzone.addEventListener("click", (e) => {
            // Avoid double firing if clicking browse button directly
            if (e.target !== browseBtn) {
                fileInput.click();
            }
        });
    }

    if (addMoreBtn && fileInput) {
        addMoreBtn.addEventListener("click", () => {
            fileInput.click();
        });
    }

    // ============================================================
    // 3. DRAG AND DROP LISTENERS
    // ============================================================
    if (dropzone) {
        ["dragenter", "dragover"].forEach((eventName) => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.add("drag-over");
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
            const dt = e.dataTransfer;
            if (dt && dt.files && dt.files.length > 0) {
                handleNewFiles(dt.files);
            }
        });
    }

    // ============================================================
    // 4. FILE INPUT CHANGE LISTENER
    // ============================================================
    if (fileInput) {
        fileInput.addEventListener("change", () => {
            if (fileInput.files && fileInput.files.length > 0) {
                handleNewFiles(fileInput.files);
            }
        });
    }

    // ============================================================
    // 5. STAGING & THUMBNAIL LOGIC
    // ============================================================
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
            // Check MIME type
            if (!ALLOWED_TYPES.includes(file.type)) {
                rejectedCount++;
                return;
            }

            // Check max size
            if (file.size > MAX_FILE_SIZE) {
                oversizedCount++;
                return;
            }

            // Check if already staged (avoid exact duplicates by name, size, lastModified)
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
            alert(`${oversizedCount} file(s) skipped because they exceed the 20MB size limit.`);
        }

        syncFileInput();
        renderStaging();
    }

    function syncFileInput() {
        // Sync stagedFiles back to the HTML fileInput using DataTransfer API
        if (!fileInput) return;
        const dt = new DataTransfer();
        stagedFiles.forEach((file) => dt.items.add(file));
        fileInput.files = dt.files;
    }

    function renderStaging() {
        if (!stagingTray || !thumbnailsGrid) return;

        if (stagedFiles.length === 0) {
            stagingTray.style.display = "none";
            thumbnailsGrid.innerHTML = "";
            if (stagedCountEl) stagedCountEl.textContent = "0";
            if (stagedSizeEl) stagedSizeEl.textContent = "0.0 MB total";
            if (submitBtnCount) submitBtnCount.textContent = "0";
            return;
        }

        // Show tray
        stagingTray.style.display = "flex";

        // Calculate total size
        const totalBytes = stagedFiles.reduce((acc, f) => acc + f.size, 0);
        if (stagedCountEl) stagedCountEl.textContent = stagedFiles.length;
        if (stagedSizeEl) stagedSizeEl.textContent = `${formatBytes(totalBytes)} total`;
        if (submitBtnCount) submitBtnCount.textContent = stagedFiles.length;

        // Render thumbnails
        thumbnailsGrid.innerHTML = "";

        stagedFiles.forEach((file, index) => {
            const card = document.createElement("div");
            card.className = "staged-photo-card";

            const thumbWrap = document.createElement("div");
            thumbWrap.className = "staged-thumb-wrap";

            const img = document.createElement("img");
            img.alt = file.name;
            const objectUrl = URL.createObjectURL(file);
            img.src = objectUrl;

            // Free object URL when image loads
            img.onload = () => {
                URL.revokeObjectURL(objectUrl);
            };

            const removeBtn = document.createElement("button");
            removeBtn.type = "button";
            removeBtn.className = "btn-remove-photo";
            removeBtn.setAttribute("aria-label", `Remove ${file.name}`);
            removeBtn.innerHTML = "&times;";

            removeBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                removeFile(index);
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

            card.appendChild(thumbWrap);
            card.appendChild(footer);

            thumbnailsGrid.appendChild(card);
        });
    }

    function removeFile(index) {
        stagedFiles.splice(index, 1);
        syncFileInput();
        renderStaging();
    }

    // ============================================================
    // 6. CLEAR ALL ACTION
    // ============================================================
    if (clearAllBtn) {
        clearAllBtn.addEventListener("click", () => {
            stagedFiles = [];
            syncFileInput();
            renderStaging();
        });
    }

    // ============================================================
    // 7. FORM SUBMISSION & PROGRESS
    // ============================================================
    if (form) {
        form.addEventListener("submit", (e) => {
            if (stagedFiles.length === 0) {
                e.preventDefault();
                alert("Please select at least one photo to upload.");
                return;
            }

            // Prevent double submission & show progress state
            if (submitBtn) {
                submitBtn.disabled = true;
                if (submitBtnText) {
                    submitBtnText.textContent = `Uploading ${stagedFiles.length} Photos...`;
                }
            }

            if (progressContainer) {
                progressContainer.style.display = "flex";
                progressContainer.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
        });
    }
});
