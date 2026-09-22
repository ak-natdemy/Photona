/**
 * Photona - Create Event Page Controller
 * - Real-time Live Card Preview Synchronization
 * - Interactive Suggestion & Date Preset Chips
 * - Right-Side Live Preview Photo Upload with Thumbnails
 * - Submit Button strictly "Create Event"
 * - Mobile Sidebar Drawer Support
 */

document.addEventListener("DOMContentLoaded", () => {
    // Form Elements
    const nameInput = document.getElementById("id_name");
    const dateInput = document.getElementById("id_event_date");
    const nameCounter = document.getElementById("name-counter");
    const previewName = document.getElementById("preview-name");
    const previewDate = document.getElementById("preview-date");
    const eventForm = document.getElementById("create-event-form");
    const submitBtn = document.getElementById("submit-btn");
    const submitBtnText = document.getElementById("submit-btn-text");

    // Live Preview Photo & AI status elements
    const previewPhotoCount = document.getElementById("preview-photo-count");
    const previewPhotoLabel = document.getElementById("preview-photo-label");
    const previewAiStatus = document.getElementById("preview-ai-status");
    const previewAiText = document.getElementById("preview-ai-text");

    // Right-Side Upload Elements
    const btnUploadPhotos = document.getElementById("btn-upload-photos");
    const btnPreviewUpload = document.getElementById("btn-preview-upload");
    const dropzone = document.getElementById("upload-dropzone");
    const photosInput = document.getElementById("id_photos");
    const selectedFilesContainer = document.getElementById("selected-files-preview");
    const filesCountText = document.getElementById("files-count-text");
    const filesGrid = document.getElementById("files-thumbnail-grid");
    const btnClearFiles = document.getElementById("btn-clear-files");

    // Mobile Elements
    const mobileMenuBtn = document.querySelector(".mobile-menu-button");
    const sidebar = document.querySelector(".sidebar");
    const sidebarOverlay = document.querySelector(".sidebar-overlay");

    // In-memory DataTransfer to manage selected files
    let dt = new DataTransfer();

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
    // 2. LIVE PREVIEW - EVENT NAME & CHARACTER COUNTER
    // ============================================================
    function updateNamePreview() {
        if (!nameInput) return;

        const val = nameInput.value.trim();
        const length = nameInput.value.length;

        if (nameCounter) {
            nameCounter.textContent = `${length} / 200`;
            if (length > 180) {
                nameCounter.style.color = "#d23c56";
            } else {
                nameCounter.style.color = "var(--text-light)";
            }
        }

        if (previewName) {
            previewName.textContent = val || "New Studio Event";
        }
    }

    if (nameInput) {
        nameInput.addEventListener("input", updateNamePreview);
        nameInput.addEventListener("keyup", updateNamePreview);
        updateNamePreview(); // Initial call
    }

    // ============================================================
    // 3. LIVE PREVIEW - EVENT DATE
    // ============================================================
    function formatDateDisplay(dateStr) {
        if (!dateStr) return "Date not specified";

        try {
            const parts = dateStr.split("-");
            if (parts.length === 3) {
                const year = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1;
                const day = parseInt(parts[2], 10);
                const d = new Date(year, month, day);

                return d.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric"
                });
            }
        } catch (e) {
            console.error("Error formatting date:", e);
        }
        return dateStr;
    }

    function updateDatePreview() {
        if (!dateInput || !previewDate) return;
        const val = dateInput.value;
        const formatted = formatDateDisplay(val);

        const svg = previewDate.querySelector("svg");
        if (svg) {
            previewDate.innerHTML = "";
            previewDate.appendChild(svg);
            previewDate.appendChild(document.createTextNode(" " + formatted));
        } else {
            previewDate.textContent = formatted;
        }
    }

    if (dateInput) {
        dateInput.addEventListener("change", updateDatePreview);
        dateInput.addEventListener("input", updateDatePreview);
        updateDatePreview(); // Initial call
    }

    // ============================================================
    // 4. QUICK CATEGORY SUGGESTION CHIPS
    // ============================================================
    const categoryChips = document.querySelectorAll("[data-category-chip]");
    categoryChips.forEach((chip) => {
        chip.addEventListener("click", () => {
            if (!nameInput) return;
            const categoryText = chip.getAttribute("data-category-chip");

            if (!nameInput.value.trim()) {
                nameInput.value = categoryText;
            } else {
                nameInput.value = `${nameInput.value.trim()} - ${categoryText}`;
            }

            nameInput.dispatchEvent(new Event("input"));
            nameInput.focus();

            chip.style.borderColor = "var(--primary-border-glow)";
            chip.style.backgroundColor = "rgba(255, 191, 0, 0.16)";
            setTimeout(() => {
                chip.style.borderColor = "";
                chip.style.backgroundColor = "";
            }, 400);
        });
    });

    // ============================================================
    // 5. QUICK DATE PRESET CHIPS
    // ============================================================
    function toISODate(d) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    const dateChips = document.querySelectorAll("[data-date-preset]");
    dateChips.forEach((chip) => {
        chip.addEventListener("click", () => {
            if (!dateInput) return;
            const preset = chip.getAttribute("data-date-preset");
            const today = new Date();
            let targetDate = new Date();

            if (preset === "today") {
                targetDate = today;
            } else if (preset === "tomorrow") {
                targetDate.setDate(today.getDate() + 1);
            } else if (preset === "weekend") {
                const dayOfWeek = today.getDay();
                const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
                targetDate.setDate(today.getDate() + daysUntilSaturday);
            } else if (preset === "next-month") {
                targetDate.setMonth(today.getMonth() + 1);
            }

            dateInput.value = toISODate(targetDate);
            dateInput.dispatchEvent(new Event("change"));

            chip.style.borderColor = "var(--primary-border-glow)";
            chip.style.backgroundColor = "rgba(255, 191, 0, 0.16)";
            setTimeout(() => {
                chip.style.borderColor = "";
                chip.style.backgroundColor = "";
            }, 400);
        });
    });

    // ============================================================
    // 6. RIGHT-SIDE PHOTO UPLOAD (IN LIVE PREVIEW)
    // ============================================================
    function formatFileSize(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    function renderFilesPreview() {
        if (!filesGrid || !selectedFilesContainer) return;

        const files = dt.files;
        const count = files.length;

        // Note: submit button text stays as "Create Event" as requested
        if (submitBtnText) {
            submitBtnText.textContent = "Create Event";
        }

        if (count === 0) {
            selectedFilesContainer.style.display = "none";
            if (previewPhotoCount) previewPhotoCount.textContent = "0";
            if (previewPhotoLabel) previewPhotoLabel.textContent = "photos";

            if (previewAiStatus && previewAiText) {
                previewAiStatus.className = "status-pill status-pending";
                previewAiText.textContent = "Waiting for Photos";
            }
            return;
        }

        // Show container
        selectedFilesContainer.style.display = "flex";
        let totalSize = 0;
        for (let i = 0; i < files.length; i++) {
            totalSize += files[i].size;
        }

        if (filesCountText) {
            filesCountText.textContent = `${count} photo${count === 1 ? "" : "s"} selected (${formatFileSize(totalSize)})`;
        }

        // Live preview synchronization
        if (previewPhotoCount) previewPhotoCount.textContent = count;
        if (previewPhotoLabel) previewPhotoLabel.textContent = count === 1 ? "photo" : "photos";

        if (previewAiStatus && previewAiText) {
            previewAiStatus.className = "status-pill status-ready";
            previewAiText.textContent = `Ready for AI Indexing (${count})`;
        }

        // Render thumbnails
        filesGrid.innerHTML = "";
        Array.from(files).forEach((file, index) => {
            const card = document.createElement("div");
            card.className = "file-thumbnail-card";

            const img = document.createElement("img");
            img.className = "file-thumb-img";
            img.src = URL.createObjectURL(file);
            img.alt = file.name;

            const meta = document.createElement("div");
            meta.className = "file-thumb-meta";
            meta.innerHTML = `
                <span class="file-thumb-name" title="${file.name}">${file.name}</span>
                <span class="file-thumb-size">${formatFileSize(file.size)}</span>
            `;

            const removeBtn = document.createElement("button");
            removeBtn.type = "button";
            removeBtn.className = "btn-remove-thumb";
            removeBtn.title = "Remove this photo";
            removeBtn.innerHTML = "&times;";
            removeBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                removeFileAtIndex(index);
            });

            card.appendChild(img);
            card.appendChild(meta);
            card.appendChild(removeBtn);
            filesGrid.appendChild(card);
        });
    }

    function removeFileAtIndex(index) {
        const newDt = new DataTransfer();
        for (let i = 0; i < dt.files.length; i++) {
            if (i !== index) {
                newDt.items.add(dt.files[i]);
            }
        }
        dt = newDt;
        if (photosInput) {
            photosInput.files = dt.files;
        }
        renderFilesPreview();
    }

    function addFiles(fileList) {
        for (let i = 0; i < fileList.length; i++) {
            const file = fileList[i];
            if (file.type.startsWith("image/")) {
                dt.items.add(file);
            }
        }
        if (photosInput) {
            photosInput.files = dt.files;
        }
        renderFilesPreview();
    }

    // Connect both the dropzone and the Upload button inside preview card
    if (btnUploadPhotos && photosInput) {
        btnUploadPhotos.addEventListener("click", () => {
            photosInput.click();
        });
    }

    if (btnPreviewUpload && photosInput) {
        btnPreviewUpload.addEventListener("click", () => {
            photosInput.click();
        });
    }

    if (dropzone && photosInput) {
        dropzone.addEventListener("click", () => {
            photosInput.click();
        });

        dropzone.addEventListener("dragover", (e) => {
            e.preventDefault();
            dropzone.classList.add("dragover");
        });

        dropzone.addEventListener("dragleave", () => {
            dropzone.classList.remove("dragover");
        });

        dropzone.addEventListener("drop", (e) => {
            e.preventDefault();
            dropzone.classList.remove("dragover");
            if (e.dataTransfer && e.dataTransfer.files.length > 0) {
                addFiles(e.dataTransfer.files);
            }
        });

        photosInput.addEventListener("change", () => {
            if (photosInput.files && photosInput.files.length > 0) {
                addFiles(photosInput.files);
            }
        });
    }

    if (btnClearFiles) {
        btnClearFiles.addEventListener("click", () => {
            dt = new DataTransfer();
            if (photosInput) {
                photosInput.files = dt.files;
            }
            renderFilesPreview();
        });
    }

    // ============================================================
    // 7. FORM SUBMISSION LOADING STATE
    // ============================================================
    if (eventForm && submitBtn) {
        eventForm.addEventListener("submit", () => {
            if (!eventForm.checkValidity()) {
                return;
            }

            submitBtn.disabled = true;
            submitBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="spin-icon">
                    <line x1="12" y1="2" x2="12" y2="6"></line>
                    <line x1="12" y1="18" x2="12" y2="22"></line>
                    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
                    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                    <line x1="2" y1="12" x2="6" y2="12"></line>
                    <line x1="18" y1="12" x2="22" y2="12"></line>
                    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
                    <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
                </svg>
                <span>Creating Event...</span>
            `;
            submitBtn.style.opacity = "0.9";
            submitBtn.style.cursor = "wait";
        });
    }
});
