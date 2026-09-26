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
    // 3. SHARE EVENT & ACCESS LINKS HUB CONTROLLER
    // ============================================================
    const btnGenerateShareLink = document.getElementById("btn-generate-share-link");
    const shareLinksContainer = document.getElementById("share-links-container");
    const activeLinksCount = document.getElementById("active-links-count");

    const qrModal = document.getElementById("qr-preview-modal");
    const qrModalImg = document.getElementById("qr-modal-img");
    const qrModalTitle = document.getElementById("qr-modal-title");
    const btnDownloadQr = document.getElementById("btn-download-qr");

    const editLinkModal = document.getElementById("edit-link-modal");
    const editLinkIdInput = document.getElementById("edit-link-id");
    const editIsAllPhotosInput = document.getElementById("edit-is-all-photos");
    const editPasswordInput = document.getElementById("edit-password");
    const editExpiresAtInput = document.getElementById("edit-expires-at");
    const btnSaveEditLink = document.getElementById("btn-save-edit-link");

    function getCsrfToken() {
        const input = document.querySelector('input[name="csrfmiddlewaretoken"]');
        return input ? input.value : "";
    }

    function updateActiveCount() {
        if (!shareLinksContainer || !activeLinksCount) return;
        const cards = shareLinksContainer.querySelectorAll(".share-link-card");
        activeLinksCount.textContent = cards.length;
    }

    function buildLinkCard(link, eventName) {
        const isAlbum = link.is_all_photos_accessible;
        const typeClass = isAlbum ? "type-album" : "type-selfie";
        const typePill = isAlbum
            ? '<span class="pill-badge pill-album">📂 Full Event Album</span>'
            : '<span class="pill-badge pill-selfie">✨ AI Face Find Link</span>';
        const lockPill = link.has_password
            ? '<span class="pill-badge pill-locked" title="Password protected">🔒 Password</span>'
            : '';
        const expiryPill = link.expires_at_formatted !== 'Never'
            ? `<span class="pill-badge pill-expiry ${link.is_expired ? 'is-expired' : ''}">⏳ ${link.is_expired ? 'Expired' : 'Expires: ' + link.expires_at_formatted}</span>`
            : '';
        const shareBtnClass = isAlbum ? 'btn-share-album' : 'btn-share-selfie';
        const shareType = isAlbum ? 'album' : 'selfie';

        const card = document.createElement('div');
        card.className = `share-link-card ${typeClass}`;
        card.id = `link-card-${link.id}`;
        card.dataset.linkId = link.id;

        card.innerHTML = `
            <div class="link-card-header">
                <div class="link-type-badges">
                    ${typePill}
                    ${lockPill}
                    ${expiryPill}
                </div>
                <div class="link-created-date">
                    Created: ${link.created_at_formatted}
                </div>
            </div>
            <div class="link-url-row">
                <input type="text" class="link-url-input" value="${link.url}" readonly>
                <button type="button" class="btn-copy-card-link" data-url="${link.url}" title="Copy link to clipboard">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    <span>Copy</span>
                </button>
            </div>
            <div class="link-actions-row">
                <button
                    type="button"
                    class="btn-share-channel-main ${shareBtnClass}"
                    data-url="${link.url}"
                    data-name="${eventName}"
                    data-type="${shareType}"
                >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="18" cy="5" r="3"></circle>
                        <circle cx="6" cy="12" r="3"></circle>
                        <circle cx="18" cy="19" r="3"></circle>
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                    </svg>
                    <span class="share-main-text">${link.share_btn_text}</span>
                </button>
                <div class="link-mini-channels">
                    <a href="https://api.whatsapp.com/send?text=${encodeURIComponent((isAlbum ? `View all photos from ${eventName} here: ` : `Find your photos from ${eventName} with a quick selfie: `) + link.url)}" target="_blank" rel="noopener" class="mini-channel-btn whatsapp" title="Share via WhatsApp">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
                        </svg>
                    </a>
                    <a href="mailto:?subject=${encodeURIComponent(eventName + ' Photos')}&body=${encodeURIComponent((isAlbum ? `Here is the link to view all event photos:
` : `Here is your AI facial search portal to find your photos:
`) + link.url)}" class="mini-channel-btn email" title="Share via Email">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                            <polyline points="22,6 12,13 2,6"></polyline>
                        </svg>
                    </a>
                </div>
                <div class="link-manage-icons">
                    <button
                        type="button"
                        class="action-icon-btn btn-show-qr"
                        data-link-id="${link.id}"
                        data-url="${link.url}"
                        data-qr="${link.qr_code}"
                        data-title="${eventName} (${link.share_type_label})"
                        title="View & Download QR Code"
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="3" width="7" height="7"></rect>
                            <rect x="14" y="3" width="7" height="7"></rect>
                            <rect x="14" y="14" width="7" height="7"></rect>
                            <rect x="3" y="14" width="7" height="7"></rect>
                        </svg>
                    </button>
                    <button
                        type="button"
                        class="action-icon-btn btn-open-edit-link"
                        data-link-id="${link.id}"
                        data-is-all="${link.is_all_photos_accessible}"
                        data-password="${link.password || ''}"
                        data-expires="${link.expires_at || ''}"
                        title="Edit Link Settings"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button
                        type="button"
                        class="action-icon-btn btn-delete-link"
                        data-link-id="${link.id}"
                        title="Delete Link"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;
        return card;
    }

    // 1. GENERATE LINK
    if (btnGenerateShareLink) {
        btnGenerateShareLink.addEventListener("click", async () => {
            const eventId = btnGenerateShareLink.dataset.eventId;
            const isAllCheckbox = document.getElementById("gen-is-all-photos");
            const passwordInput = document.getElementById("gen-password");
            const expiresInput = document.getElementById("gen-expires-at");
            const genBtnText = document.getElementById("generate-btn-text");

            const isAllPhotos = isAllCheckbox ? isAllCheckbox.checked : false;
            const password = passwordInput ? passwordInput.value.trim() : "";
            const expiresAt = expiresInput ? expiresInput.value : "";

            btnGenerateShareLink.disabled = true;
            if (genBtnText) genBtnText.textContent = "Generating...";

            try {
                const response = await fetch(`/events/${eventId}/links/create/`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-CSRFToken": getCsrfToken(),
                    },
                    body: JSON.stringify({
                        is_all_photos_accessible: isAllPhotos,
                        password: password,
                        expires_at: expiresAt,
                    })
                });

                const data = await response.json();
                if (data.success && data.link) {
                    const eventTitleEl = document.querySelector(".modal-header h2");
                    const eventName = eventTitleEl ? eventTitleEl.textContent.replace(/^Share\s+"?|"?$/g, '') : "Event";
                    const newCard = buildLinkCard(data.link, eventName);

                    if (shareLinksContainer) {
                        shareLinksContainer.insertBefore(newCard, shareLinksContainer.firstChild);
                        newCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
                    }
                    updateActiveCount();

                    // Reset form
                    if (isAllCheckbox) isAllCheckbox.checked = false;
                    if (passwordInput) passwordInput.value = "";
                    if (expiresInput) expiresInput.value = "";

                    // Brief success indicator on button
                    if (genBtnText) genBtnText.textContent = "✓ Generated!";
                    setTimeout(() => {
                        if (genBtnText) genBtnText.textContent = "Generate Link";
                        btnGenerateShareLink.disabled = false;
                    }, 1500);
                } else {
                    alert("Could not generate share link. Please try again.");
                    btnGenerateShareLink.disabled = false;
                    if (genBtnText) genBtnText.textContent = "Generate Link";
                }
            } catch (err) {
                console.error("Error generating link:", err);
                alert("An error occurred while creating the link.");
                btnGenerateShareLink.disabled = false;
                if (genBtnText) genBtnText.textContent = "Generate Link";
            }
        });
    }

    // 2. COPY LINK BUTTON DELEGATION
    document.addEventListener("click", async (e) => {
        const copyBtn = e.target.closest(".btn-copy-card-link");
        if (copyBtn) {
            const url = copyBtn.dataset.url;
            const spanText = copyBtn.querySelector("span");
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(url);
                } else {
                    const input = copyBtn.closest(".link-url-row").querySelector("input");
                    if (input) {
                        input.select();
                        document.execCommand("copy");
                    }
                }
                if (spanText) spanText.textContent = "Copied!";
                copyBtn.style.background = "#FFA200";
                copyBtn.style.color = "#141226";
                copyBtn.style.borderColor = "#FFA200";
                setTimeout(() => {
                    if (spanText) spanText.textContent = "Copy";
                    copyBtn.style.background = "";
                    copyBtn.style.color = "";
                    copyBtn.style.borderColor = "";
                }, 2000);
            } catch (err) {
                console.warn("Clipboard copy fallback:", err);
            }
        }
    });

    // 3. CONTEXTUAL SHARE BUTTON DELEGATION (Native Web Share / Fallback)
    document.addEventListener("click", async (e) => {
        const shareBtn = e.target.closest(".btn-share-channel-main");
        if (shareBtn) {
            const url = shareBtn.dataset.url;
            const name = shareBtn.dataset.name || "Event Photos";
            const isAlbum = shareBtn.dataset.type === "album";

            const shareTitle = `${name} - ${isAlbum ? 'Full Photo Album' : 'Find Your Photos'}`;
            const shareText = isAlbum
                ? `View and download all event photos from "${name}" here:`
                : `Find every photo you appear in from "${name}" with a quick selfie:`;

            if (navigator.share) {
                try {
                    await navigator.share({
                        title: shareTitle,
                        text: shareText,
                        url: url
                    });
                } catch (shareErr) {
                    if (shareErr.name !== "AbortError") {
                        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + ' ' + url)}`, '_blank');
                    }
                }
            } else {
                // Fallback: copy to clipboard and open WhatsApp
                if (navigator.clipboard) {
                    await navigator.clipboard.writeText(url);
                }
                window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + ' ' + url)}`, '_blank');
            }
        }
    });

    // 4. SHOW QR CODE MODAL
    document.addEventListener("click", (e) => {
        const qrBtn = e.target.closest(".btn-show-qr");
        if (qrBtn) {
            const qrBase64 = qrBtn.dataset.qr;
            const qrTitle = qrBtn.dataset.title || "Event QR Code";
            if (qrModalImg) {
                qrModalImg.src = `data:image/png;base64,${qrBase64}`;
            }
            if (qrModalTitle) {
                qrModalTitle.textContent = qrTitle;
            }
            if (btnDownloadQr) {
                btnDownloadQr.href = `data:image/png;base64,${qrBase64}`;
                btnDownloadQr.download = `photona_qr_${Date.now()}.png`;
            }
            openModal("qr-preview-modal");
        }
    });

    // 5. OPEN EDIT LINK MODAL
    document.addEventListener("click", (e) => {
        const editBtn = e.target.closest(".btn-open-edit-link");
        if (editBtn) {
            const linkId = editBtn.dataset.linkId;
            const isAll = editBtn.dataset.isAll === "true" || editBtn.dataset.isAll === "True";
            const password = editBtn.dataset.password || "";
            const expires = editBtn.dataset.expires || "";

            if (editLinkIdInput) editLinkIdInput.value = linkId;
            if (editIsAllPhotosInput) editIsAllPhotosInput.checked = isAll;
            if (editPasswordInput) editPasswordInput.value = password;
            if (editExpiresAtInput) {
                // Format datetime-local if present
                if (expires) {
                    const d = new Date(expires);
                    if (!isNaN(d.getTime())) {
                        const isoStr = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                        editExpiresAtInput.value = isoStr;
                    } else {
                        editExpiresAtInput.value = expires.slice(0, 16);
                    }
                } else {
                    editExpiresAtInput.value = "";
                }
            }

            openModal("edit-link-modal");
        }
    });

    // 6. SAVE EDIT LINK
    if (btnSaveEditLink) {
        btnSaveEditLink.addEventListener("click", async () => {
            const linkId = editLinkIdInput ? editLinkIdInput.value : "";
            const eventId = shareLinksContainer ? shareLinksContainer.dataset.eventId : "";
            if (!linkId || !eventId) return;

            btnSaveEditLink.disabled = true;
            btnSaveEditLink.textContent = "Saving...";

            try {
                const response = await fetch(`/events/${eventId}/links/${linkId}/update/`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-CSRFToken": getCsrfToken(),
                    },
                    body: JSON.stringify({
                        is_all_photos_accessible: editIsAllPhotosInput ? editIsAllPhotosInput.checked : false,
                        password: editPasswordInput ? editPasswordInput.value.trim() : "",
                        expires_at: editExpiresAtInput ? editExpiresAtInput.value : "",
                    })
                });

                const data = await response.json();
                if (data.success && data.link) {
                    const eventTitleEl = document.querySelector(".modal-header h2");
                    const eventName = eventTitleEl ? eventTitleEl.textContent.replace(/^Share\s+"?|"?$/g, '') : "Event";
                    const updatedCard = buildLinkCard(data.link, eventName);

                    const existingCard = document.getElementById(`link-card-${linkId}`);
                    if (existingCard && shareLinksContainer) {
                        shareLinksContainer.replaceChild(updatedCard, existingCard);
                    }

                    closeModal("edit-link-modal");
                } else {
                    alert("Could not update link. Please try again.");
                }
            } catch (err) {
                console.error("Error updating link:", err);
                alert("An error occurred while saving link settings.");
            } finally {
                btnSaveEditLink.disabled = false;
                btnSaveEditLink.textContent = "Save Changes";
            }
        });
    }

    // 7. DELETE LINK DELEGATION
    document.addEventListener("click", async (e) => {
        const deleteBtn = e.target.closest(".btn-delete-link");
        if (deleteBtn) {
            const linkId = deleteBtn.dataset.linkId;
            const eventId = shareLinksContainer ? shareLinksContainer.dataset.eventId : "";
            if (!linkId || !eventId) return;

            if (!confirm("Are you sure you want to delete this share link? Guests with this link will no longer be able to access the event.")) {
                return;
            }

            deleteBtn.disabled = true;
            try {
                const response = await fetch(`/events/${eventId}/links/${linkId}/delete/`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-CSRFToken": getCsrfToken(),
                    },
                    body: JSON.stringify({})
                });

                const data = await response.json();
                if (data.success) {
                    const card = document.getElementById(`link-card-${linkId}`);
                    if (card) {
                        card.style.opacity = "0";
                        card.style.transform = "scale(0.95)";
                        card.style.transition = "all 0.25s ease";
                        setTimeout(() => {
                            card.remove();
                            updateActiveCount();
                        }, 250);
                    }
                } else {
                    alert("Could not delete link. Please try again.");
                    deleteBtn.disabled = false;
                }
            } catch (err) {
                console.error("Error deleting link:", err);
                alert("An error occurred while deleting the link.");
                deleteBtn.disabled = false;
            }
        }
    });

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
    const stripScrollPrev = document.getElementById("strip-scroll-prev");
    const stripScrollNext = document.getElementById("strip-scroll-next");

    const MAX_BATCH_PHOTOS = 150;
    let selectedFiles = [];
    let objectUrlsToRevoke = [];

    // Modern floating toast alert for batch limit enforcement
    function showBatchLimitToast(message) {
        let toast = document.getElementById("batch-limit-toast");
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "batch-limit-toast";
            toast.className = "batch-limit-toast";
            document.body.appendChild(toast);
        }
        toast.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>${message}</span>
        `;
        toast.classList.add("show");
        if (toast._hideTimer) clearTimeout(toast._hideTimer);
        toast._hideTimer = setTimeout(() => {
            toast.classList.remove("show");
        }, 4000);
    }

    // Parse existing photos in this album to prevent duplicates completely
    const existingAlbumPhotoSignatures = new Set();
    try {
        const rawJsonEl = document.getElementById("existing-event-photos-json");
        if (rawJsonEl) {
            const list = JSON.parse(rawJsonEl.textContent || "[]");
            list.forEach((item) => {
                if (item.name) {
                    const clean = item.name.split("/").pop().toLowerCase().trim();
                    existingAlbumPhotoSignatures.add(clean);
                    if (item.size) {
                        existingAlbumPhotoSignatures.add(`${clean}_${item.size}`);
                    }
                }
            });
        }
    } catch (err) {
        console.warn("Failed to parse existing photos json:", err);
    }

    function enforceBatchLimit(incomingFiles, isAppending) {
        let combined = isAppending ? [...selectedFiles] : [];
        const batchKeys = new Set(combined.map((f) => `${f.name.toLowerCase().trim()}_${f.size}`));
        let duplicateCount = 0;
        let overflow = false;

        for (const file of incomingFiles) {
            const cleanName = file.name.toLowerCase().trim();
            const fullKey = `${cleanName}_${file.size}`;

            // 1. Block if already uploaded to this event album
            const isAlreadyInAlbum = existingAlbumPhotoSignatures.has(cleanName) || existingAlbumPhotoSignatures.has(fullKey);

            // 2. Block if duplicate within the current selection batch
            const isDuplicateInBatch = batchKeys.has(fullKey) || batchKeys.has(cleanName);

            if (isAlreadyInAlbum || isDuplicateInBatch) {
                duplicateCount++;
                continue; // STRICTLY PREVENT DUPLICATES
            }

            if (combined.length < MAX_BATCH_PHOTOS) {
                combined.push(file);
                batchKeys.add(fullKey);
                batchKeys.add(cleanName);
            } else {
                overflow = true;
                break;
            }
        }

        if (duplicateCount > 0) {
            showBatchLimitToast(`${duplicateCount} duplicate photo${duplicateCount > 1 ? "s were" : " was"} blocked (already in album or batch).`);
        }

        if (overflow) {
            showBatchLimitToast(`Batch limit reached: Maximum ${MAX_BATCH_PHOTOS} photos per upload.`);
        }

        return combined;
    }

    // Reference to names scrolling list elements
    const dropzoneNamesList = document.getElementById("dropzone-names-list");
    const previewTotalSize = document.getElementById("preview-total-size");

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
        selectedFiles = [];

        if (photosFileInput) {
            photosFileInput.value = "";
            photosFileInput.title = "";
            photosFileInput.style.pointerEvents = "auto";
            photosFileInput.style.display = "";
        }

        if (dropzoneBox) dropzoneBox.classList.remove("has-files");
        if (dropzoneNamesList) dropzoneNamesList.innerHTML = "";
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

    // Render photo names in a smooth scrolling list (NO IMAGE THUMBNAILS = ZERO LAG)
    function renderPreviewStrip() {
        if (dropzoneNamesList) dropzoneNamesList.innerHTML = "";

        let totalBytes = 0;

        selectedFiles.forEach((file, index) => {
            totalBytes += (file.size || 0);

            const item = document.createElement("div");
            item.className = "staged-file-item";

            const fileKb = ((file.size || 0) / 1024);
            const sizeStr = fileKb > 1024 ? (fileKb / 1024).toFixed(1) + " MB" : Math.round(fileKb) + " KB";

            const info = document.createElement("div");
            info.className = "staged-file-info";

            const icon = document.createElement("div");
            icon.className = "staged-file-icon";
            icon.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
            `;

            const nameSpan = document.createElement("span");
            nameSpan.className = "staged-file-name";
            nameSpan.textContent = file.name;
            nameSpan.title = file.name;

            const sizeSpan = document.createElement("span");
            sizeSpan.className = "staged-file-size";
            sizeSpan.textContent = sizeStr;

            info.appendChild(icon);
            info.appendChild(nameSpan);
            info.appendChild(sizeSpan);

            // Remove button for individual staged photo
            const btnRemove = document.createElement("button");
            btnRemove.type = "button";
            btnRemove.className = "btn-remove-staged-file";
            btnRemove.title = `Remove ${file.name}`;
            btnRemove.setAttribute("aria-label", `Remove ${file.name}`);
            btnRemove.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            `;
            btnRemove.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                removeFileAtIndex(index);
            });

            item.appendChild(info);
            item.appendChild(btnRemove);

            dropzoneNamesList.appendChild(item);
        });

        const totalMb = (totalBytes / (1024 * 1024)).toFixed(1);
        if (previewTotalSize) {
            previewTotalSize.textContent = `${totalMb} MB total`;
        }

        if (previewCountChip) {
            const count = selectedFiles.length;
            if (count >= MAX_BATCH_PHOTOS) {
                previewCountChip.className = "preview-count-chip chip-limit-reached";
                previewCountChip.textContent = `${count} / ${MAX_BATCH_PHOTOS} photos (Batch Limit Reached)`;
            } else {
                previewCountChip.className = "preview-count-chip";
                previewCountChip.textContent = `${count} photo${count > 1 ? "s" : ""} staged (max ${MAX_BATCH_PHOTOS})`;
            }
        }

        if (dropzoneIdleContent) dropzoneIdleContent.style.display = "none";
        if (dropzonePreviewContainer) dropzonePreviewContainer.style.display = "flex";
        if (dropzoneBox) dropzoneBox.classList.add("has-files");

        if (photosFileInput) {
            photosFileInput.title = "";
            photosFileInput.style.pointerEvents = "none";
            photosFileInput.style.display = "none";
        }

        const fileCount = selectedFiles.length;
        if (btnStartUpload) {
            btnStartUpload.removeAttribute("disabled");
            if (uploadBtnLabel) uploadBtnLabel.textContent = `Upload & Process (${fileCount})`;
        }
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
                selectedFiles = enforceBatchLimit(imageFiles, false);
                syncInputFiles();
                if (selectedFiles.length > 0) {
                    renderPreviewStrip();
                } else {
                    cleanupPreviews();
                }
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
                    selectedFiles = enforceBatchLimit(droppedFiles, selectedFiles.length > 0);
                    syncInputFiles();
                    if (selectedFiles.length > 0) {
                        renderPreviewStrip();
                    } else {
                        cleanupPreviews();
                    }
                }
            }
        });
    }

    // Ensure dropzone starts completely in idle mode on page load
    cleanupPreviews();

    let isUploading = false;
    const localUploadForm = document.getElementById("local-upload-form");
    const dropzoneUploadingOverlay = document.getElementById("dropzone-uploading-overlay");
    const uploadBarFill = document.getElementById("upload-bar-fill");
    const uploadPctText = document.getElementById("upload-pct-text");
    const uploadBytesText = document.getElementById("upload-bytes-text");
    const uploadProgressTitle = document.getElementById("upload-progress-title");
    const uploadStatusSubtext = document.getElementById("upload-status-subtext");
    const uploadSpinPath = document.querySelector(".upload-spin-path");

    if (localUploadForm) {
        localUploadForm.addEventListener("submit", (e) => {
            e.preventDefault();

            if (isUploading) return;

            syncInputFiles();
            if (!selectedFiles || selectedFiles.length === 0) {
                alert("Please select at least one photo to upload.");
                return;
            }

            isUploading = true;

            // Lock UI and prevent double submission
            if (btnStartUpload) {
                btnStartUpload.disabled = true;
                btnStartUpload.style.opacity = "0.6";
                btnStartUpload.style.pointerEvents = "none";
                if (uploadBtnLabel) uploadBtnLabel.textContent = "Uploading...";
            }
            if (photosFileInput) photosFileInput.disabled = true;

            // Show live progress overlay
            if (dropzoneUploadingOverlay) {
                dropzoneUploadingOverlay.style.display = "flex";
                if (uploadProgressTitle) {
                    uploadProgressTitle.textContent = `Uploading ${selectedFiles.length} photo${selectedFiles.length > 1 ? "s" : ""}...`;
                }
                if (uploadBarFill) uploadBarFill.style.width = "0%";
                if (uploadPctText) uploadPctText.textContent = "0%";
                if (uploadStatusSubtext) uploadStatusSubtext.textContent = "Transferring high-resolution files to server...";
            }

            // AJAX Upload via XMLHttpRequest for real-time progress feedback
            const xhr = new XMLHttpRequest();
            const formData = new FormData();

            // CSRF Token
            const csrfInput = localUploadForm.querySelector("input[name='csrfmiddlewaretoken']");
            if (csrfInput) {
                formData.append("csrfmiddlewaretoken", csrfInput.value);
            }

            selectedFiles.forEach((f) => {
                formData.append("images", f, f.name);
            });

            xhr.upload.addEventListener("progress", (evt) => {
                if (evt.lengthComputable) {
                    const percent = Math.min(100, Math.round((evt.loaded / evt.total) * 100));
                    const loadedMb = (evt.loaded / (1024 * 1024)).toFixed(1);
                    const totalMb = (evt.total / (1024 * 1024)).toFixed(1);

                    if (uploadBarFill) uploadBarFill.style.width = percent + "%";
                    if (uploadPctText) uploadPctText.textContent = percent + "%";
                    if (uploadBytesText) uploadBytesText.textContent = `${loadedMb} MB / ${totalMb} MB`;

                    if (uploadSpinPath) {
                        const circumference = 125.6; // 2 * PI * 20
                        const offset = circumference - (percent / 100) * circumference;
                        uploadSpinPath.style.strokeDashoffset = offset;
                    }

                    if (percent >= 100) {
                        if (uploadProgressTitle) uploadProgressTitle.textContent = "Server Indexing & Deduplication...";
                        if (uploadStatusSubtext) uploadStatusSubtext.textContent = "Checking duplicates & preparing album...";
                    }
                }
            });

            xhr.addEventListener("load", () => {
                if (xhr.status >= 200 && xhr.status < 400) {
                    let resp = null;
                    try {
                        resp = JSON.parse(xhr.responseText);
                    } catch (err) {}

                    if (uploadBarFill) uploadBarFill.style.width = "100%";
                    if (uploadPctText) uploadPctText.textContent = "100%";
                    if (uploadProgressTitle) {
                        uploadProgressTitle.textContent = resp && resp.all_duplicates ? "Duplicate Photos Detected" : "Upload Complete!";
                    }
                    if (uploadStatusSubtext) {
                        uploadStatusSubtext.textContent = resp ? resp.message : "Refreshing album...";
                    }

                    // Smooth reload / redirect
                    setTimeout(() => {
                        window.location.reload();
                    }, resp && resp.all_duplicates ? 2000 : 700);
                } else {
                    let errMsg = "Upload encountered an error. Please try again.";
                    try {
                        const errResp = JSON.parse(xhr.responseText);
                        if (errResp && errResp.message) errMsg = errResp.message;
                    } catch (err) {}
                    alert(errMsg);
                    isUploading = false;
                    if (btnStartUpload) {
                        btnStartUpload.disabled = false;
                        btnStartUpload.style.opacity = "1";
                        btnStartUpload.style.pointerEvents = "auto";
                        if (uploadBtnLabel) uploadBtnLabel.textContent = "Upload";
                    }
                    if (photosFileInput) photosFileInput.disabled = false;
                    if (dropzoneUploadingOverlay) dropzoneUploadingOverlay.style.display = "none";
                }
            });

            xhr.addEventListener("error", () => {
                alert("Network error occurred during upload. Please check your connection and try again.");
                isUploading = false;
                if (btnStartUpload) {
                    btnStartUpload.disabled = false;
                    btnStartUpload.style.opacity = "1";
                    btnStartUpload.style.pointerEvents = "auto";
                    if (uploadBtnLabel) uploadBtnLabel.textContent = "Upload";
                }
                if (photosFileInput) photosFileInput.disabled = false;
                if (dropzoneUploadingOverlay) dropzoneUploadingOverlay.style.display = "none";
            });

            xhr.open("POST", localUploadForm.action + "?ajax=1");
            xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
            xhr.send(formData);
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
    const bulkDeleteIdsInputCompat = document.getElementById("bulk-delete-ids-input-compat");

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
                const isAll = (selectedIds.length === photoCheckboxes.length);
                if (bulkDeleteCountText) {
                    bulkDeleteCountText.textContent = isAll 
                        ? `all ${selectedIds.length} photos` 
                        : `${selectedIds.length} selected photos`;
                }
                const idsJoined = selectedIds.join(",");
                if (bulkDeleteIdsInput) {
                    bulkDeleteIdsInput.value = idsJoined;
                }
                if (bulkDeleteIdsInputCompat) {
                    bulkDeleteIdsInputCompat.value = idsJoined;
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
    // 8. REAL-TIME AI STATUS POLLING & SEQUENTIAL PHOTO REVEAL
    // ============================================================
    let pollingTimer = null;

    function shouldPoll() {
        const allCards = document.querySelectorAll(".little-photo-card");
        let hasActivePhotos = false;
        allCards.forEach((card) => {
            const status = (card.dataset.status || "").toLowerCase();
            if (status === "pending" || status === "processing" || card.classList.contains("is-processing")) {
                hasActivePhotos = true;
            }
        });
        const aiStatusElem = document.getElementById("ai-status");
        const isEventProcessing = aiStatusElem && (
            aiStatusElem.classList.contains("status-processing") || 
            aiStatusElem.classList.contains("status-pending")
        );
        return hasActivePhotos || isEventProcessing;
    }

    async function pollStatus() {
        if (!statusUrl) return;

        try {
            const response = await fetch(`${statusUrl}?_t=${Date.now()}`, {
                headers: { "X-Requested-With": "XMLHttpRequest" }
            });

            if (!response.ok) throw new Error("Status check failed");
            const data = await response.json();

            // 1. Update event topbar / hero badge
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

            // 2. Update individual photo cards & sequential reveal
            if (data.photos && Array.isArray(data.photos)) {
                data.photos.forEach((item) => {
                    const card = document.getElementById(`photo-card-${item.id}`);
                    const overlay = document.getElementById(`photo-processing-overlay-${item.id}`);
                    const img = document.getElementById(`photo-img-${item.id}`);
                    const statusCircle = document.getElementById(`photo-status-${item.id}`);
                    const badge = document.getElementById(`proc-badge-${item.id}`);
                    const spinnerWrap = document.getElementById(`proc-spinner-wrap-${item.id}`);
                    const pStatus = (item.processing_status || "pending").toLowerCase();

                    // Update bottom-right status symbol in card footer
                    if (statusCircle) {
                        statusCircle.className = `ai-status-circle status-${pStatus}`;
                        statusCircle.innerHTML = getStatusIconSVG(pStatus);
                        statusCircle.dataset.status = pStatus;
                    }

                    if (card) {
                        const prevStatus = (card.dataset.status || "").toLowerCase();
                        card.dataset.status = pStatus;

                        if (pStatus === "completed" || pStatus === "ready") {
                            // Check if this photo was masked / processing
                            const wasProcessing = card.classList.contains("is-processing") || 
                                                  (prevStatus && prevStatus !== "completed" && prevStatus !== "ready");
                            
                            card.classList.remove("is-processing", "status-pending", "status-processing");

                            if (overlay) {
                                overlay.classList.add("is-hidden");
                            }
                            if (img) {
                                img.classList.remove("img-masked");
                            }

                            if (wasProcessing) {
                                // REVEAL ANIMATION: Smoothly pop & celebrate newly ready photo!
                                card.classList.remove("just-revealed");
                                void card.offsetWidth; // Trigger reflow for animation restart
                                card.classList.add("just-revealed");
                                setTimeout(() => {
                                    card.classList.remove("just-revealed");
                                }, 2200);
                            }
                        } else if (pStatus === "processing") {
                            card.classList.add("is-processing", "status-processing");
                            card.classList.remove("status-pending");

                            if (overlay) overlay.classList.remove("is-hidden");
                            if (img) img.classList.add("img-masked");
                            if (badge) badge.textContent = "Indexing Faces...";
                            if (spinnerWrap) {
                                spinnerWrap.innerHTML = '<div class="proc-ring-spinner"></div>';
                            }
                        } else if (pStatus === "pending") {
                            card.classList.add("is-processing", "status-pending");
                            card.classList.remove("status-processing");

                            if (overlay) overlay.classList.remove("is-hidden");
                            if (img) img.classList.add("img-masked");
                            if (badge) badge.textContent = "In Queue";
                            if (spinnerWrap) {
                                spinnerWrap.innerHTML = '<div class="proc-pulse-dots"><span class="p-dot"></span><span class="p-dot"></span><span class="p-dot"></span></div>';
                            }
                        } else if (pStatus === "failed") {
                            card.classList.add("is-processing", "status-failed");
                            if (overlay) overlay.classList.remove("is-hidden");
                            if (badge) badge.textContent = "Index Failed";
                        }
                    }
                });
            }

            // 3. Update Live AI Indexing Progress Banner
            const banner = document.getElementById("live-ai-progress-banner");
            if (banner) {
                const total = data.total_count !== undefined ? data.total_count : (data.photos ? data.photos.length : 0);
                const completed = data.completed_count !== undefined ? data.completed_count : 
                    (data.photos ? data.photos.filter(p => p.processing_status === "completed" || p.processing_status === "ready").length : 0);
                const processing = data.processing_count !== undefined ? data.processing_count : 
                    (data.photos ? data.photos.filter(p => p.processing_status === "processing").length : 0);
                const pending = data.pending_count !== undefined ? data.pending_count : 
                    (data.photos ? data.photos.filter(p => p.processing_status === "pending").length : 0);
                
                const liveCompleted = document.getElementById("live-completed-count");
                const liveTotal = document.getElementById("live-total-count");
                const liveBarFill = document.getElementById("live-progress-bar-fill");
                const liveTitle = document.getElementById("live-progress-title");
                const liveSubtitle = document.getElementById("live-progress-subtitle");

                const hasUnfinished = (processing + pending) > 0;

                if (hasUnfinished) {
                    banner.style.display = "flex";
                    banner.classList.remove("is-complete");

                    if (liveCompleted) liveCompleted.textContent = completed;
                    if (liveTotal) liveTotal.textContent = total;

                    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                    if (liveBarFill) liveBarFill.style.width = `${pct}%`;

                    if (liveTitle) {
                        if (processing > 0) {
                            liveTitle.textContent = `AI Indexing in Progress (${processing} analyzing, ${pending} queued)`;
                        } else {
                            liveTitle.textContent = `Photos Uploaded & Queued (${pending} waiting)`;
                        }
                    }
                } else if (banner.style.display !== "none" && !banner.classList.contains("is-complete") && total > 0) {
                    // All photos have finished!
                    banner.classList.add("is-complete");
                    if (liveCompleted) liveCompleted.textContent = total;
                    if (liveTotal) liveTotal.textContent = total;
                    if (liveBarFill) liveBarFill.style.width = "100%";
                    if (liveTitle) liveTitle.textContent = "✓ All Photos Processed & Revealed!";
                    if (liveSubtitle) liveSubtitle.textContent = "All photos are now indexed, unmasked, and ready to explore";

                    setTimeout(() => {
                        if (banner && banner.classList.contains("is-complete")) {
                            banner.style.opacity = "0";
                            banner.style.transform = "translateY(-8px)";
                            setTimeout(() => {
                                banner.style.display = "none";
                                banner.style.opacity = "";
                                banner.style.transform = "";
                            }, 500);
                        }
                    }, 4000);
                }
            }

            // 4. Continue polling with high responsiveness while active
            if (shouldPoll()) {
                pollingTimer = setTimeout(pollStatus, 1200);
            }
        } catch (err) {
            console.warn("AI Status poll error:", err);
            pollingTimer = setTimeout(pollStatus, 3500);
        }
    }

    if (shouldPoll()) {
        pollingTimer = setTimeout(pollStatus, 1000);
    }

    // ============================================================
    // 9. SORTED PEOPLE & GALLERY TABS CONTROLLER
    // ============================================================
    const tabBtnAll = document.getElementById("tab-btn-all");
    const tabBtnPeople = document.getElementById("tab-btn-people");
    const tabViewAll = document.getElementById("tab-view-all-photos");
    const tabViewPeople = document.getElementById("tab-view-sorted-people");

    function switchGalleryTab(tab) {
        if (tab === "sorted-people") {
            if (tabBtnPeople) {
                tabBtnPeople.classList.add("active");
                tabBtnPeople.setAttribute("aria-selected", "true");
            }
            if (tabBtnAll) {
                tabBtnAll.classList.remove("active");
                tabBtnAll.setAttribute("aria-selected", "false");
            }
            if (tabViewAll) tabViewAll.style.display = "none";
            if (tabViewPeople) tabViewPeople.style.display = "block";
        } else {
            if (tabBtnAll) {
                tabBtnAll.classList.add("active");
                tabBtnAll.setAttribute("aria-selected", "true");
            }
            if (tabBtnPeople) {
                tabBtnPeople.classList.remove("active");
                tabBtnPeople.setAttribute("aria-selected", "false");
            }
            if (tabViewAll) tabViewAll.style.display = "block";
            if (tabViewPeople) tabViewPeople.style.display = "none";
        }
    }

    if (tabBtnAll) {
        tabBtnAll.addEventListener("click", () => switchGalleryTab("all-photos"));
    }
    if (tabBtnPeople) {
        tabBtnPeople.addEventListener("click", () => switchGalleryTab("sorted-people"));
    }

    // --- People Catalog & Drilldown Controller ---
    const peopleCatalogContainer = document.getElementById("people-catalog-container");
    const personDrilldownContainer = document.getElementById("person-drilldown-container");
    const btnBackToPeople = document.getElementById("btn-back-to-people");
    const drilldownPersonName = document.getElementById("drilldown-person-name");
    const drilldownAvatarImg = document.getElementById("drilldown-avatar-img");
    const drilldownPhotoCount = document.getElementById("drilldown-photo-count");
    const btnDrilldownRename = document.getElementById("btn-drilldown-rename");
    const btnDrilldownDownloadZip = document.getElementById("btn-drilldown-download-zip");
    const personPhotosGrid = document.getElementById("person-photos-grid");

    let activePersonPhotos = [];
    let currentPersonPhotoIndex = 0;
    let isPersonDrilldownActive = false;

    async function openPersonDrilldown(personId, personName, avatarUrl) {
        if (!personDrilldownContainer || !peopleCatalogContainer) return;
        isPersonDrilldownActive = true;
        peopleCatalogContainer.style.display = "none";
        personDrilldownContainer.style.display = "block";

        if (drilldownPersonName) drilldownPersonName.textContent = personName;
        if (drilldownAvatarImg) drilldownAvatarImg.src = avatarUrl;
        if (drilldownPhotoCount) drilldownPhotoCount.textContent = "Loading photos...";
        if (btnDrilldownRename) btnDrilldownRename.dataset.personId = personId;
        if (btnDrilldownDownloadZip) {
            btnDrilldownDownloadZip.href = `/events/${eventId}/people/${personId}/download/`;
            btnDrilldownDownloadZip.setAttribute("download", `${personName.replace(/\s+/g, '_')}_photos.zip`);
        }

        if (personPhotosGrid) {
            personPhotosGrid.innerHTML = `
                <div class="drilldown-loading" style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4rem 1rem; color: #64748b; gap: 14px;">
                    <div class="drilldown-spinner" style="width: 36px; height: 36px; border: 3px solid rgba(255, 162, 0, 0.2); border-top-color: #FFA200; border-radius: 50%; animation: reclusterSpin 0.75s linear infinite;"></div>
                    <span style="font-weight: 600; font-size: 13.5px;">Loading person's photos...</span>
                </div>
            `;
        }

        try {
            const res = await fetch(`/events/${eventId}/people/${personId}/photos/`, {
                headers: { "X-Requested-With": "XMLHttpRequest" }
            });
            const data = await res.json();
            if (data.success && data.photos) {
                activePersonPhotos = data.photos;
                if (drilldownPhotoCount) {
                    drilldownPhotoCount.textContent = `${activePersonPhotos.length} photo${activePersonPhotos.length === 1 ? '' : 's'}`;
                }
                renderPersonPhotos(activePersonPhotos);
            } else {
                if (personPhotosGrid) {
                    personPhotosGrid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: #64748b;"><p>No photos found for this person.</p></div>`;
                }
            }
        } catch (err) {
            console.error("Failed to load person photos:", err);
            if (personPhotosGrid) {
                personPhotosGrid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: #ef4444;"><p>Could not load photos for this person.</p></div>`;
            }
        }
    }

    function renderPersonPhotos(photos) {
        if (!personPhotosGrid) return;
        if (photos.length === 0) {
            personPhotosGrid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: #64748b;"><p>No photos available.</p></div>`;
            return;
        }

        personPhotosGrid.innerHTML = photos.map((p, idx) => {
            // CRITICAL User Constraint: img src MUST BE the lightweight thumbnail for fast loading,
            // while download link and lightbox view provide the original uncompressed image.
            const thumbUrl = p.thumbnail_url || p.image_url;
            return `
                <div class="little-photo-card" id="person-photo-${p.id}" data-id="${p.id}">
                    <div class="photo-thumb-container person-photo-thumb" data-idx="${idx}" data-full-img="${p.image_url}" data-photo-id="${p.id}">
                        <img src="${thumbUrl}" alt="${p.filename || 'Photo'}" loading="lazy" class="card-photo-img">
                        <div class="card-hover-actions">
                            <a href="${p.image_url}" download="${p.filename || 'photo.jpg'}" class="hover-action-btn hover-btn-download" title="Download original high-res photo">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                    <polyline points="7 10 12 15 17 10"></polyline>
                                    <line x1="12" y1="15" x2="12" y2="3"></line>
                                </svg>
                            </a>
                        </div>
                    </div>
                    <div class="photo-card-info">
                        <div class="photo-info-left">
                            <span class="photo-chrono-number" style="max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.filename}</span>
                            <span class="photo-upload-time">${p.uploaded_at}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join("");

        // Bind click on person photo thumbnail to open lightbox with full uncompressed image
        personPhotosGrid.querySelectorAll(".person-photo-thumb").forEach((thumb) => {
            thumb.addEventListener("click", (e) => {
                if (e.target.closest(".hover-action-btn")) return;
                const idx = parseInt(thumb.dataset.idx, 10);
                openPersonLightbox(idx);
            });
        });
    }

    function openPersonLightbox(idx) {
        if (activePersonPhotos.length === 0) return;
        if (idx < 0) idx = 0;
        if (idx >= activePersonPhotos.length) idx = activePersonPhotos.length - 1;
        currentPersonPhotoIndex = idx;
        updatePersonLightboxContent();

        if (lightbox) {
            lightbox.classList.add("active");
            lightbox.setAttribute("aria-hidden", "false");
            document.body.style.overflow = "hidden";
        }
    }

    function updatePersonLightboxContent() {
        const p = activePersonPhotos[currentPersonPhotoIndex];
        if (!p) return;
        if (lightboxImg) lightboxImg.src = p.image_url;
        if (lightboxTitle) lightboxTitle.textContent = p.filename || `Photo #${currentPersonPhotoIndex + 1}`;
        if (lightboxCounter) lightboxCounter.textContent = `Photo ${currentPersonPhotoIndex + 1} of ${activePersonPhotos.length}`;
        if (lightboxDownload) {
            lightboxDownload.href = p.image_url;
            lightboxDownload.setAttribute("download", p.filename || `photo_${p.id}.jpg`);
        }
    }

    function prevPersonPhoto() {
        if (activePersonPhotos.length <= 1) return;
        currentPersonPhotoIndex = (currentPersonPhotoIndex - 1 + activePersonPhotos.length) % activePersonPhotos.length;
        updatePersonLightboxContent();
    }

    function nextPersonPhoto() {
        if (activePersonPhotos.length <= 1) return;
        currentPersonPhotoIndex = (currentPersonPhotoIndex + 1) % activePersonPhotos.length;
        updatePersonLightboxContent();
    }

    // Hook lightbox prev/next controls to person photo navigation when drilldown is active
    if (lightboxPrev) {
        const originalLightboxPrev = lightboxPrev.onclick;
        lightboxPrev.addEventListener("click", () => {
            if (isPersonDrilldownActive && activePersonPhotos.length > 0) {
                prevPersonPhoto();
            }
        });
    }

    if (lightboxNext) {
        lightboxNext.addEventListener("click", () => {
            if (isPersonDrilldownActive && activePersonPhotos.length > 0) {
                nextPersonPhoto();
            }
        });
    }

    // Keyboard arrows support for person lightbox
    document.addEventListener("keydown", (e) => {
        if (!lightbox || !lightbox.classList.contains("active")) return;
        if (isPersonDrilldownActive && activePersonPhotos.length > 0) {
            if (e.key === "ArrowLeft") prevPersonPhoto();
            else if (e.key === "ArrowRight") nextPersonPhoto();
        }
    });

    if (btnBackToPeople) {
        btnBackToPeople.addEventListener("click", () => {
            isPersonDrilldownActive = false;
            if (personDrilldownContainer) personDrilldownContainer.style.display = "none";
            if (peopleCatalogContainer) peopleCatalogContainer.style.display = "block";
        });
    }

    // Bind Person Cards click
    document.querySelectorAll(".person-card").forEach((card) => {
        const viewBtn = card.querySelector(".btn-view-person-photos");
        const avatarWrap = card.querySelector(".person-avatar-wrap");
        const personId = card.dataset.personId;
        const personName = card.dataset.personName;
        const avatarImg = card.querySelector(".person-avatar-img");
        const avatarUrl = avatarImg ? avatarImg.src : "";

        const clickHandler = (e) => {
            if (e.target.closest(".btn-edit-person-name") || e.target.closest(".btn-download-person-zip")) return;
            openPersonDrilldown(personId, personName, avatarUrl);
        };

        if (viewBtn) viewBtn.addEventListener("click", clickHandler);
        if (avatarWrap) avatarWrap.addEventListener("click", clickHandler);
    });

    // --- Person Rename Modal & Handlers ---
    const editPersonNameModal = document.getElementById("edit-person-name-modal");
    const editPersonIdInput = document.getElementById("edit-person-id");
    const inputPersonName = document.getElementById("input-person-name");
    const editPersonNameForm = document.getElementById("edit-person-name-form");
    const btnSavePersonName = document.getElementById("btn-save-person-name");

    function openRenamePersonModal(personId, currentName) {
        if (editPersonIdInput) editPersonIdInput.value = personId;
        if (inputPersonName) {
            inputPersonName.value = currentName || "";
            setTimeout(() => inputPersonName.focus(), 80);
        }
        openModal("edit-person-name-modal");
    }

    document.addEventListener("click", (e) => {
        const renameBtn = e.target.closest(".btn-edit-person-name");
        if (renameBtn) {
            e.preventDefault();
            e.stopPropagation();
            const personId = renameBtn.dataset.personId || renameBtn.closest(".person-card")?.dataset.personId;
            const card = document.getElementById(`person-card-${personId}`);
            const currentName = card ? card.dataset.personName : (drilldownPersonName ? drilldownPersonName.textContent : "");
            if (personId) {
                openRenamePersonModal(personId, currentName);
            }
        }
    });

    if (editPersonNameForm) {
        editPersonNameForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const personId = editPersonIdInput ? editPersonIdInput.value : "";
            const newName = inputPersonName ? inputPersonName.value.trim() : "";
            if (!personId || !newName) return;

            if (btnSavePersonName) {
                btnSavePersonName.disabled = true;
                btnSavePersonName.textContent = "Saving...";
            }

            try {
                const res = await fetch(`/events/${eventId}/people/${personId}/rename/`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-CSRFToken": getCsrfToken()
                    },
                    body: JSON.stringify({ name: newName })
                });
                const data = await res.json();
                if (data.success) {
                    const card = document.getElementById(`person-card-${personId}`);
                    if (card) {
                        card.dataset.personName = data.name;
                        const nameTxt = document.getElementById(`person-name-txt-${personId}`);
                        if (nameTxt) nameTxt.textContent = data.name;
                    }
                    if (drilldownPersonName && (btnDrilldownRename?.dataset.personId == personId)) {
                        drilldownPersonName.textContent = data.name;
                    }
                    closeModal("edit-person-name-modal");
                } else {
                    alert(data.error || "Failed to rename person.");
                }
            } catch (err) {
                console.error("Rename failed:", err);
                alert("An error occurred while renaming.");
            } finally {
                if (btnSavePersonName) {
                    btnSavePersonName.disabled = false;
                    btnSavePersonName.textContent = "Save Name";
                }
            }
        });
    }

    // --- Re-clustering Handler ---
    async function triggerRecluster(btn) {
        if (!btn) return;
        const url = btn.dataset.url || `/events/${eventId}/people/recluster/`;
        btn.classList.add("loading");
        btn.disabled = true;
        const textSpan = btn.querySelector("span") || btn.querySelector("#recluster-btn-text");
        if (textSpan) textSpan.textContent = "Grouping faces...";

        try {
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    "X-CSRFToken": getCsrfToken()
                }
            });
            const data = await res.json();
            if (data.success) {
                window.location.reload();
            } else {
                alert(data.error || "Failed to cluster faces.");
                btn.classList.remove("loading");
                btn.disabled = false;
                if (textSpan) textSpan.textContent = "Refresh People Groups";
            }
        } catch (err) {
            console.error("Reclustering failed:", err);
            alert("An error occurred while clustering faces.");
            btn.classList.remove("loading");
            btn.disabled = false;
            if (textSpan) textSpan.textContent = "Refresh People Groups";
        }
    }

    const btnRecluster = document.getElementById("btn-recluster-people");
    if (btnRecluster) btnRecluster.addEventListener("click", () => triggerRecluster(btnRecluster));
    const btnInitCluster = document.getElementById("btn-initial-cluster");
    if (btnInitCluster) btnInitCluster.addEventListener("click", () => triggerRecluster(btnInitCluster));

});
