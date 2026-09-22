/**
 * Photona - Event Detail & Overview Controller (v4.0)
 * - Ingestion Tab switching (Upload Photos vs Google Drive Import)
 * - Drag and drop dropzone with instant client-side thumbnail preview strip
 * - Button text dynamics ("Upload" -> "Upload & Process")
 * - Google Drive batch import with animated spinner and status feedback
 * - Top-right rounded glass photo selection checkboxes
 * - Dynamic toolbar:
 *   - "Select All" located on right near Download button
 *   - Counter displayed only when >= 1 selected
 *   - Delete button hidden when 0, "Delete" when 1, "Delete All" when >= 2
 *   - Download button says "Download All (ZIP)" when < 2, "Download Selected (ZIP)" when >= 2
 * - Individual hover actions (direct download & delete confirmation)
 * - Edit Event modal trigger
 * - Lightbox modal with keyboard navigation
 * - Real-time AI status polling (/events/<id>/status/)
 */

document.addEventListener("DOMContentLoaded", () => {
    // Helper: SVG for AI status
    function getStatusIconSVG(status) {
        const s = (status || "").toLowerCase();
        if (s === "completed" || s === "ready") {
            return `<svg class="status-svg" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="#10b981" stroke-width="2" fill="rgba(16, 185, 129, 0.12)" /><polyline points="7.8 12 10.6 14.8 16.2 9.2" stroke="#10b981" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>`;
        }
        if (s === "processing") {
            return `<svg class="status-svg circle-buffer-svg" viewBox="0 0 24 24" fill="none"><circle class="buffer-track" cx="12" cy="12" r="8.5" stroke="rgba(255, 162, 0, 0.25)" stroke-width="2.5" /><circle class="buffer-fill" cx="12" cy="12" r="8.5" stroke="#FFA200" stroke-width="2.5" stroke-linecap="round" /></svg>`;
        }
        if (s === "failed") {
            return `<svg class="status-svg" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="#ef4444" stroke-width="2" fill="rgba(239, 68, 68, 0.12)" /><line x1="8.5" y1="8.5" x2="15.5" y2="15.5" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round" /><line x1="15.5" y1="8.5" x2="8.5" y2="15.5" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round" /></svg>`;
        }
        return `<svg class="status-svg" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="#94a3b8" stroke-width="2" fill="rgba(148, 163, 184, 0.12)" /><circle cx="12" cy="12" r="2.5" fill="#64748b" /></svg>`;
    }

    const viewport = document.getElementById("event-viewport");
    const statusUrl = viewport ? viewport.dataset.statusUrl : null;
    const eventId = viewport ? viewport.dataset.eventId : null;

    // ============================================================
    // 1. MOBILE SIDEBAR NAVIGATION
    // ============================================================
    const mobileMenuBtn = document.getElementById("mobile-menu-btn");
    const sidebar = document.getElementById("sidebar");
    const sidebarOverlay = document.getElementById("sidebar-overlay");

    if (mobileMenuBtn && sidebar && sidebarOverlay) {
        mobileMenuBtn.addEventListener("click", () => {
            sidebar.classList.toggle("open");
            sidebarOverlay.classList.toggle("active");
        });

        sidebarOverlay.addEventListener("click", () => {
            sidebar.classList.remove("open");
            sidebarOverlay.classList.remove("active");
        });
    }

    // ============================================================
    // 2. MODAL CONTROLS (Edit Event, Delete Photo, Bulk Delete)
    // ============================================================
    function openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add("active");
            modal.setAttribute("aria-hidden", "false");
            const firstInput = modal.querySelector("input:not([type=hidden]), textarea");
            if (firstInput) setTimeout(() => firstInput.focus(), 60);
        }
    }

    function closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove("active");
            modal.setAttribute("aria-hidden", "true");
        }
    }

    document.querySelectorAll("[data-close-modal]").forEach((btn) => {
        btn.addEventListener("click", () => {
            closeModal(btn.getAttribute("data-close-modal"));
        });
    });

    document.querySelectorAll(".modal-dialog-backdrop").forEach((backdrop) => {
        backdrop.addEventListener("click", (e) => {
            if (e.target === backdrop) {
                backdrop.classList.remove("active");
                backdrop.setAttribute("aria-hidden", "true");
            }
        });
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            document.querySelectorAll(".modal-dialog-backdrop.active").forEach((m) => {
                m.classList.remove("active");
                m.setAttribute("aria-hidden", "true");
            });
        }
    });

    // Edit Event Triggers (Header, Hero card, and generic data-open-modal)
    const btnEditHeader = document.getElementById("btn-edit-event-header");
    if (btnEditHeader) {
        btnEditHeader.addEventListener("click", () => {
            openModal("edit-event-modal");
        });
    }

    const btnEditHero = document.getElementById("btn-edit-event-hero");
    if (btnEditHero) {
        btnEditHero.addEventListener("click", () => {
            openModal("edit-event-modal");
        });
    }

    document.querySelectorAll("[data-open-modal]").forEach((btn) => {
        btn.addEventListener("click", () => {
            openModal(btn.getAttribute("data-open-modal"));
        });
    });

    // ============================================================
    // 3. SHARE EVENT MODAL & CLIPBOARD COPY (Requirement 5)
    // ============================================================
    const btnCopyShareUrl = document.getElementById("btn-copy-share-url");
    const shareUrlInput = document.getElementById("share-portal-url-input");
    const copyFeedback = document.getElementById("copy-success-feedback");
    const copyBtnText = document.getElementById("copy-btn-text");

    if (btnCopyShareUrl && shareUrlInput) {
        btnCopyShareUrl.addEventListener("click", async () => {
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(shareUrlInput.value);
                } else {
                    shareUrlInput.select();
                    document.execCommand("copy");
                }
                if (copyBtnText) copyBtnText.textContent = "Copied!";
                if (copyFeedback) copyFeedback.style.display = "block";
                setTimeout(() => {
                    if (copyBtnText) copyBtnText.textContent = "Copy Link";
                    if (copyFeedback) copyFeedback.style.display = "none";
                }, 2500);
            } catch (err) {
                shareUrlInput.select();
            }
        });
    }

    // ============================================================
    // 4. DROPZONE WITH INSTANT MINIATURE PREVIEW THUMBNAILS & REMOVE (Points 9, 10 & User Requests 1, 2, 3)
    // ============================================================
    const dropzoneBox = document.getElementById("dropzone-box");
    const photosFileInput = document.getElementById("photos-file-input");
    const dropzoneIdleContent = document.getElementById("dropzone-idle-content");
    const dropzonePreviewContainer = document.getElementById("dropzone-preview-container");
    const dropzoneThumbnailsStrip = document.getElementById("dropzone-thumbnails-strip");
    const previewCountChip = document.getElementById("preview-count-chip");
    const btnClearSelectedFiles = document.getElementById("btn-clear-selected-files");
    const btnStartUpload = document.getElementById("btn-start-upload");
    const uploadBtnLabel = document.getElementById("upload-btn-label");

    let selectedFiles = [];
    let objectUrlsToRevoke = [];

    // Helper to sync photosFileInput.files with selectedFiles array using DataTransfer
    function syncInputFiles() {
        if (!photosFileInput) return;
        try {
            const dt = new DataTransfer();
            selectedFiles.forEach((file) => dt.items.add(file));
            photosFileInput.files = dt.files;
        } catch (e) {
            console.warn("DataTransfer update failed:", e);
        }
    }

    function cleanupPreviews() {
        objectUrlsToRevoke.forEach((url) => URL.revokeObjectURL(url));
        objectUrlsToRevoke = [];
        selectedFiles = [];

        if (photosFileInput) {
            photosFileInput.value = "";
            photosFileInput.title = "";
            photosFileInput.style.pointerEvents = "auto";
            photosFileInput.style.display = "";
        }

        if (dropzoneBox) dropzoneBox.classList.remove("has-files");
        if (dropzoneThumbnailsStrip) dropzoneThumbnailsStrip.innerHTML = "";
        if (dropzonePreviewContainer) dropzonePreviewContainer.style.display = "none";
        if (dropzoneIdleContent) dropzoneIdleContent.style.display = "flex";
        if (btnStartUpload) btnStartUpload.setAttribute("disabled", "true");
        if (uploadBtnLabel) uploadBtnLabel.textContent = "Upload";
    }

    function removeFileAtIndex(index) {
        if (index < 0 || index >= selectedFiles.length) return;
        selectedFiles.splice(index, 1);
        syncInputFiles();

        if (selectedFiles.length === 0) {
            cleanupPreviews();
        } else {
            renderPreviewStrip();
        }
    }

    function renderPreviewStrip() {
        // Clear old Object URLs to prevent memory leaks
        objectUrlsToRevoke.forEach((url) => URL.revokeObjectURL(url));
        objectUrlsToRevoke = [];
        if (dropzoneThumbnailsStrip) dropzoneThumbnailsStrip.innerHTML = "";

        selectedFiles.forEach((file, index) => {
            const objectUrl = URL.createObjectURL(file);
            objectUrlsToRevoke.push(objectUrl);

            const card = document.createElement("div");
            card.className = "mini-upload-card";

            const thumbWrap = document.createElement("div");
            thumbWrap.className = "mini-upload-thumb-wrap";

            const img = document.createElement("img");
            img.src = objectUrl;
            img.alt = file.name;
            img.className = "mini-upload-thumb";

            // User Request 2: Option to remove that image (little small - icon)
            const btnRemove = document.createElement("button");
            btnRemove.type = "button";
            btnRemove.className = "btn-remove-thumb";
            btnRemove.title = `Remove ${file.name}`;
            btnRemove.setAttribute("aria-label", `Remove ${file.name}`);
            btnRemove.innerHTML = `
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
            `;
            btnRemove.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                removeFileAtIndex(index);
            });

            // User Request 1: When someone hovers the image, ONLY that image's name is shown
            const tooltip = document.createElement("div");
            tooltip.className = "thumb-hover-tooltip";
            tooltip.textContent = file.name;

            thumbWrap.appendChild(img);
            thumbWrap.appendChild(btnRemove);
            thumbWrap.appendChild(tooltip);

            const nameSpan = document.createElement("span");
            nameSpan.className = "mini-upload-name";
            nameSpan.textContent = file.name;

            card.appendChild(thumbWrap);
            card.appendChild(nameSpan);
            dropzoneThumbnailsStrip.appendChild(card);
        });

        if (previewCountChip) {
            previewCountChip.textContent = `${selectedFiles.length} photo${selectedFiles.length > 1 ? "s" : ""} ready to upload`;
        }

        if (dropzoneIdleContent) dropzoneIdleContent.style.display = "none";
        if (dropzonePreviewContainer) dropzonePreviewContainer.style.display = "flex";
        if (dropzoneBox) dropzoneBox.classList.add("has-files");

        // User Request 3: Prevent browser from showing list of all photo names on hover
        if (photosFileInput) {
            photosFileInput.title = "";
            photosFileInput.style.pointerEvents = "none";
            photosFileInput.style.display = "none";
        }

        if (btnStartUpload) btnStartUpload.removeAttribute("disabled");
        if (uploadBtnLabel) uploadBtnLabel.textContent = "Upload & Process";
    }

    if (btnClearSelectedFiles && photosFileInput) {
        btnClearSelectedFiles.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Restore file input so user can choose new files
            photosFileInput.value = "";
            photosFileInput.style.display = "";
            photosFileInput.style.pointerEvents = "auto";
            photosFileInput.click();
        });
    }

    if (photosFileInput && dropzoneBox) {
        photosFileInput.addEventListener("change", () => {
            const files = Array.from(photosFileInput.files || []);
            const imageFiles = files.filter((f) => f.type.startsWith("image/"));

            if (imageFiles.length > 0) {
                selectedFiles = imageFiles;
                syncInputFiles();
                renderPreviewStrip();
            } else if (selectedFiles.length === 0) {
                cleanupPreviews();
            }
        });

        // Clicking on dropzone when idle triggers file picker
        dropzoneBox.addEventListener("click", (e) => {
            // Only trigger if not already in preview mode or clicking outside preview container
            if (!dropzoneBox.classList.contains("has-files")) {
                photosFileInput.click();
            }
        });

        // Drag & Drop effects
        ["dragenter", "dragover"].forEach((eventName) => {
            dropzoneBox.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzoneBox.classList.add("dragover");
            });
        });

        ["dragleave", "drop"].forEach((eventName) => {
            dropzoneBox.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzoneBox.classList.remove("dragover");
            });
        });

        dropzoneBox.addEventListener("drop", (e) => {
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const droppedFiles = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
                if (droppedFiles.length > 0) {
                    if (selectedFiles.length === 0) {
                        selectedFiles = droppedFiles;
                    } else {
                        const existingKeys = new Set(selectedFiles.map((f) => `${f.name}_${f.size}`));
                        droppedFiles.forEach((f) => {
                            if (!existingKeys.has(`${f.name}_${f.size}`)) {
                                selectedFiles.push(f);
                            }
                        });
                    }
                    syncInputFiles();
                    renderPreviewStrip();
                }
            }
        });
    }

    // ============================================================
    // 5. GOOGLE DRIVE IMPORT HANDLER
    // ============================================================
    const driveImportForm = document.getElementById("drive-import-form");
    const btnSubmitDrive = document.getElementById("btn-submit-drive");
    const driveFeedbackAlert = document.getElementById("drive-feedback-alert");

    if (driveImportForm) {
        driveImportForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            const driveUrlInput = document.getElementById("drive_url");
            const driveUrl = driveUrlInput ? driveUrlInput.value.trim() : "";
            if (!driveUrl) return;

            const btnText = btnSubmitDrive.querySelector(".btn-text");
            const btnSpinner = btnSubmitDrive.querySelector(".btn-spinner");

            btnSubmitDrive.disabled = true;
            if (btnText) btnText.style.display = "none";
            if (btnSpinner) btnSpinner.style.display = "inline-flex";
            if (driveFeedbackAlert) driveFeedbackAlert.style.display = "none";

            const formData = new FormData(driveImportForm);

            try {
                const response = await fetch(driveImportForm.action, {
                    method: "POST",
                    body: formData,
                    headers: {
                        "X-Requested-With": "XMLHttpRequest"
                    }
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    if (driveFeedbackAlert) {
                        driveFeedbackAlert.className = "drive-feedback-alert success";
                        driveFeedbackAlert.textContent = data.message || `Successfully imported ${data.imported_count} photo(s)! Reloading...`;
                        driveFeedbackAlert.style.display = "block";
                    }
                    setTimeout(() => {
                        window.location.reload();
                    }, 1400);
                } else {
                    if (driveFeedbackAlert) {
                        driveFeedbackAlert.className = "drive-feedback-alert error";
                        driveFeedbackAlert.textContent = data.error || "Failed to import from Google Drive. Please check permissions.";
                        driveFeedbackAlert.style.display = "block";
                    }
                }
            } catch (err) {
                if (driveFeedbackAlert) {
                    driveFeedbackAlert.className = "drive-feedback-alert error";
                    driveFeedbackAlert.textContent = "Network error while connecting to server. Please try again.";
                    driveFeedbackAlert.style.display = "block";
                }
            } finally {
                btnSubmitDrive.disabled = false;
                if (btnText) btnText.style.display = "inline";
                if (btnSpinner) btnSpinner.style.display = "none";
            }
        });
    }

    // ============================================================
    // 6. PHOTO SELECTION & DYNAMIC TOOLBAR (Points 3, 4, 5, 8, 12)
    // ============================================================
    const photoCards = Array.from(document.querySelectorAll(".little-photo-card"));
    const photoCheckboxes = Array.from(document.querySelectorAll(".photo-checkbox"));
    const masterSelectCheckbox = document.getElementById("master-select-checkbox");
    const btnSelectAll = document.getElementById("btn-select-all");
    const selectAllLabel = document.getElementById("select-all-label");
    const selectedCounterTag = document.getElementById("selected-counter-tag");
    const selectedCountNum = document.getElementById("selected-count-num");

    const btnDynamicDownloadZip = document.getElementById("btn-dynamic-download-zip");
    const downloadBtnText = document.getElementById("download-btn-text");
    const btnDynamicDelete = document.getElementById("btn-dynamic-delete");
    const deleteBtnText = document.getElementById("delete-btn-text");

    function getSelectedPhotoIds() {
        return photoCheckboxes
            .filter((chk) => chk.checked)
            .map((chk) => chk.value);
    }

    function updateSelectionUI() {
        const selectedIds = getSelectedPhotoIds();
        const total = photoCheckboxes.length;
        const count = selectedIds.length;

        // Point 12: Display count only after at least 1 image is selected
        if (selectedCounterTag) {
            if (count >= 1) {
                selectedCounterTag.style.display = "inline-flex";
                if (selectedCountNum) selectedCountNum.textContent = count;
            } else {
                selectedCounterTag.style.display = "none";
            }
        }

        // Highlight selected cards
        photoCards.forEach((card) => {
            const chk = card.querySelector(".photo-checkbox");
            if (chk && chk.checked) {
                card.classList.add("selected");
            } else {
                card.classList.remove("selected");
            }
        });

        // Point 4 & 8: Delete button visibility and text
        if (btnDynamicDelete) {
            if (count === 0) {
                btnDynamicDelete.style.display = "none";
            } else if (count === 1) {
                btnDynamicDelete.style.display = "inline-flex";
                if (deleteBtnText) deleteBtnText.textContent = "Delete";
            } else {
                // 2 or more selected
                btnDynamicDelete.style.display = "inline-flex";
                if (deleteBtnText) deleteBtnText.textContent = "Delete All";
            }
        }

        // Point 5: Download button switches to "Download Selected (ZIP)" when >= 2
        if (btnDynamicDownloadZip && downloadBtnText) {
            if (count >= 2) {
                downloadBtnText.textContent = "Download Selected (ZIP)";
                btnDynamicDownloadZip.title = `Download ${count} selected photos as ZIP`;
            } else {
                downloadBtnText.textContent = "Download All (ZIP)";
                btnDynamicDownloadZip.title = "Download all photos in this album as ZIP";
            }
        }

        // Master checkbox state
        if (masterSelectCheckbox) {
            if (count === total && total > 0) {
                masterSelectCheckbox.checked = true;
                masterSelectCheckbox.indeterminate = false;
                if (selectAllLabel) selectAllLabel.textContent = "Deselect All";
            } else if (count > 0) {
                masterSelectCheckbox.checked = false;
                masterSelectCheckbox.indeterminate = true;
                if (selectAllLabel) selectAllLabel.textContent = "Select All";
            } else {
                masterSelectCheckbox.checked = false;
                masterSelectCheckbox.indeterminate = false;
                if (selectAllLabel) selectAllLabel.textContent = "Select All";
            }
        }
    }

    // Individual checkbox changes
    photoCheckboxes.forEach((chk) => {
        chk.addEventListener("change", updateSelectionUI);
    });

    // Master Select All Button
    if (btnSelectAll && masterSelectCheckbox) {
        btnSelectAll.addEventListener("click", (e) => {
            if (e.target !== masterSelectCheckbox) {
                masterSelectCheckbox.checked = !masterSelectCheckbox.checked;
            }
            const shouldCheck = masterSelectCheckbox.checked;
            photoCheckboxes.forEach((chk) => {
                chk.checked = shouldCheck;
            });
            updateSelectionUI();
        });

        masterSelectCheckbox.addEventListener("change", () => {
            const shouldCheck = masterSelectCheckbox.checked;
            photoCheckboxes.forEach((chk) => {
                chk.checked = shouldCheck;
            });
            updateSelectionUI();
        });
    }

    // Dynamic Download ZIP handler
    if (btnDynamicDownloadZip && eventId) {
        btnDynamicDownloadZip.addEventListener("click", (e) => {
            const selectedIds = getSelectedPhotoIds();
            if (selectedIds.length >= 2) {
                // Intercept to download only selected photos
                e.preventDefault();
                window.location.href = `/events/${eventId}/download-zip/?ids=${selectedIds.join(",")}`;
            }
            // If < 2, default href triggers full album ZIP download
        });
    }

    // Dynamic Delete button handler (Points 4 & 8)
    const bulkDeleteModal = document.getElementById("bulk-delete-modal");
    const bulkDeleteCountText = document.getElementById("bulk-delete-count-text");
    const bulkDeleteIdsInput = document.getElementById("bulk-delete-ids-input");

    const deletePhotoModal = document.getElementById("delete-photo-modal");
    const deletePhotoForm = document.getElementById("delete-photo-form");
    const deletePhotoLabel = document.getElementById("delete-photo-label");

    if (btnDynamicDelete) {
        btnDynamicDelete.addEventListener("click", () => {
            const selectedIds = getSelectedPhotoIds();
            if (selectedIds.length === 0) return;

            if (selectedIds.length === 1) {
                // Delete single selected photo
                const singleId = selectedIds[0];
                if (deletePhotoForm && eventId) {
                    deletePhotoForm.action = `/events/${eventId}/photos/${singleId}/delete/`;
                }
                if (deletePhotoLabel) deletePhotoLabel.textContent = `selected photo`;
                openModal("delete-photo-modal");
            } else {
                // Bulk delete multiple photos
                if (bulkDeleteCountText) {
                    bulkDeleteCountText.textContent = `${selectedIds.length} selected photos`;
                }
                if (bulkDeleteIdsInput) {
                    bulkDeleteIdsInput.value = selectedIds.join(",");
                }
                openModal("bulk-delete-modal");
            }
        });
    }

    // Individual photo hover delete
    document.querySelectorAll(".hover-btn-delete").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const photoId = btn.getAttribute("data-delete-photo-id");
            const photoNum = btn.getAttribute("data-photo-num") || "";

            if (deletePhotoForm && eventId) {
                deletePhotoForm.action = `/events/${eventId}/photos/${photoId}/delete/`;
            }
            if (deletePhotoLabel) {
                deletePhotoLabel.textContent = `#${photoNum}`;
            }
            openModal("delete-photo-modal");
        });
    });

    // ============================================================
    // 7. PHOTONA STUDIO LIGHTBOX MODAL
    // ============================================================
    const lightbox = document.getElementById("image-lightbox");
    const lightboxBackdrop = document.getElementById("lightbox-backdrop");
    const lightboxClose = document.getElementById("lightbox-close");
    const lightboxImg = document.getElementById("lightbox-image");
    const lightboxTitle = document.getElementById("lightbox-title");
    const lightboxCounter = document.getElementById("lightbox-counter");
    const lightboxDownload = document.getElementById("lightbox-download");
    const lightboxPrev = document.getElementById("lightbox-prev");
    const lightboxNext = document.getElementById("lightbox-next");

    let currentPhotoIndex = 0;

    function openLightbox(index) {
        if (photoCards.length === 0) return;
        if (index < 0) index = 0;
        if (index >= photoCards.length) index = photoCards.length - 1;
        currentPhotoIndex = index;

        updateLightboxContent();

        if (lightbox) {
            lightbox.classList.add("active");
            lightbox.setAttribute("aria-hidden", "false");
            document.body.style.overflow = "hidden";
        }
    }

    function closeLightbox() {
        if (lightbox) {
            lightbox.classList.remove("active");
            lightbox.setAttribute("aria-hidden", "true");
            document.body.style.overflow = "";
        }
    }

    function updateLightboxContent() {
        const card = photoCards[currentPhotoIndex];
        if (!card) return;

        const thumb = card.querySelector(".photo-thumb-container");
        const fullImg = thumb ? thumb.dataset.fullImg : "";
        const photoId = card.dataset.id || "";
        const photoNum = thumb ? thumb.dataset.photoNumber : (currentPhotoIndex + 1);

        if (lightboxImg) lightboxImg.src = fullImg;
        if (lightboxTitle) lightboxTitle.textContent = `Photo #${photoNum}`;
        if (lightboxCounter) lightboxCounter.textContent = `Photo ${currentPhotoIndex + 1} of ${photoCards.length}`;
        if (lightboxDownload) {
            lightboxDownload.href = fullImg;
            lightboxDownload.setAttribute("download", `photo_${photoId}.jpg`);
        }
    }

    function prevPhoto() {
        if (photoCards.length <= 1) return;
        currentPhotoIndex = (currentPhotoIndex - 1 + photoCards.length) % photoCards.length;
        updateLightboxContent();
    }

    function nextPhoto() {
        if (photoCards.length <= 1) return;
        currentPhotoIndex = (currentPhotoIndex + 1) % photoCards.length;
        updateLightboxContent();
    }

    photoCards.forEach((card, idx) => {
        const thumb = card.querySelector(".photo-thumb-container");
        if (thumb) {
            thumb.addEventListener("click", (e) => {
                if (e.target.closest(".hover-action-btn") || e.target.closest(".card-select-overlay-right")) return;
                openLightbox(idx);
            });
        }
    });

    if (lightboxClose) lightboxClose.addEventListener("click", closeLightbox);
    if (lightboxBackdrop) lightboxBackdrop.addEventListener("click", closeLightbox);
    if (lightboxPrev) lightboxPrev.addEventListener("click", prevPhoto);
    if (lightboxNext) lightboxNext.addEventListener("click", nextPhoto);

    document.addEventListener("keydown", (e) => {
        if (!lightbox || !lightbox.classList.contains("active")) return;
        if (e.key === "Escape") closeLightbox();
        else if (e.key === "ArrowLeft") prevPhoto();
        else if (e.key === "ArrowRight") nextPhoto();
    });

    // ============================================================
    // 8. REAL-TIME AI STATUS POLLING
    // ============================================================
    let pollingTimer = null;

    function shouldPoll() {
        const pendingOrProcessing = photoCards.some((card) => {
            const status = (card.dataset.status || "").toLowerCase();
            return status === "pending" || status === "processing";
        });
        const aiStatusElem = document.getElementById("ai-status");
        const isEventProcessing = aiStatusElem && aiStatusElem.classList.contains("status-processing");
        return pendingOrProcessing || isEventProcessing;
    }

    async function pollStatus() {
        if (!statusUrl) return;

        try {
            const response = await fetch(statusUrl, {
                headers: { "X-Requested-With": "XMLHttpRequest" }
            });

            if (!response.ok) throw new Error("Status check failed");
            const data = await response.json();

            // Update event status
            const aiStatusPill = document.getElementById("ai-status");
            const aiStatusText = document.getElementById("ai-status-text");
            if (aiStatusPill && data.ai_status) {
                const s = data.ai_status.toLowerCase();
                aiStatusPill.className = `hero-status-pill status-${s}`;
                const circle = aiStatusPill.querySelector(".ai-status-circle");
                if (circle) {
                    circle.className = `ai-status-circle status-${s}`;
                    circle.innerHTML = getStatusIconSVG(s);
                }
                if (aiStatusText) {
                    aiStatusText.textContent = (s === "ready" || s === "completed") ? "AI Ready" : (s.charAt(0).toUpperCase() + s.slice(1));
                }
            }

            // Update photo status circles
            if (data.photos && Array.isArray(data.photos)) {
                data.photos.forEach((item) => {
                    const statusCircle = document.getElementById(`photo-status-${item.id}`);
                    const card = document.getElementById(`photo-card-${item.id}`);
                    const pStatus = (item.processing_status || "").toLowerCase();

                    if (statusCircle) {
                        statusCircle.className = `ai-status-circle status-${pStatus}`;
                        statusCircle.innerHTML = getStatusIconSVG(pStatus);
                        statusCircle.dataset.status = pStatus;
                    }
                    if (card) {
                        card.dataset.status = pStatus;
                    }
                });
            }

            if (shouldPoll()) {
                pollingTimer = setTimeout(pollStatus, 4000);
            }
        } catch (err) {
            pollingTimer = setTimeout(pollStatus, 7000);
        }
    }

    if (shouldPoll()) {
        pollingTimer = setTimeout(pollStatus, 2500);
    }
});
