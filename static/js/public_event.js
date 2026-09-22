/**
 * Photona - Public Guest Event Portal Controller (v3.0)
 * - Automatic Front Camera WebRTC streaming on "Take a Selfie" click
 * - In-viewfinder golden frame, face guide, shutter snap animation & capture
 * - "Find My Photos" submit button revealed ONLY after selfie is taken
 * - Retake photo seamlessly re-opens front camera stream
 * - Multi-photo selection and batch ZIP download (uncompressed original quality)
 * - Direct one-click download for individual original photos
 * - Lightbox modal preview with keyboard navigation (Esc, Arrow keys)
 */

document.addEventListener("DOMContentLoaded", () => {
    // Front Camera / Selfie elements
    const btnTakeSelfie = document.getElementById("btn-take-selfie");
    const btnChooseGallery = document.getElementById("btn-choose-gallery");
    const takeSelfieCta = document.getElementById("take-selfie-cta");
    const cameraViewfinder = document.getElementById("camera-viewfinder");
    const selfieVideo = document.getElementById("selfie-video");
    const btnCloseCam = document.getElementById("btn-close-cam");
    const btnCaptureShutter = document.getElementById("btn-capture-shutter");
    const cameraFlash = document.getElementById("camera-flash");

    const selfieInput = document.getElementById("id_selfie");
    const selfiePreviewCard = document.getElementById("selfie-preview-card");
    const selfiePreviewImg = document.getElementById("selfie-preview-img");
    const btnRetake = document.getElementById("btn-retake-selfie");
    const selfieSubmitArea = document.getElementById("selfie-submit-area");

    const searchForm = document.getElementById("selfie-search-form");
    const searchBtn = document.getElementById("search-button");
    const searchBtnText = document.getElementById("search-btn-text");
    const searchLoading = document.getElementById("search-loading");

    // Toggle selfie card buttons
    const btnSearchAgain = document.getElementById("btn-search-again");
    const btnTryAgain = document.getElementById("btn-try-again");
    const selfieCardSection = document.getElementById("selfie-card-section");

    // Batch download elements
    const selectAllCheckbox = document.getElementById("select-all-checkbox");
    const photoCheckboxes = document.querySelectorAll(".photo-item-checkbox");
    const selectedCounter = document.getElementById("selected-counter");
    const downloadZipBtn = document.getElementById("download-zip-btn");
    const zipBtnText = document.getElementById("zip-btn-text");
    const zipBtnCount = document.getElementById("zip-btn-count");

    // Lightbox elements
    const lightbox = document.getElementById("guest-lightbox");
    const lightboxBackdrop = document.getElementById("lightbox-backdrop");
    const lightboxClose = document.getElementById("lightbox-close-btn");
    const lightboxImg = document.getElementById("lightbox-img");
    const lightboxTitle = document.getElementById("lightbox-title");
    const lightboxCounter = document.getElementById("lightbox-counter");
    const lightboxDownloadBtn = document.getElementById("lightbox-download-btn");
    const lightboxPrev = document.getElementById("lightbox-prev");
    const lightboxNext = document.getElementById("lightbox-next");

    const matchCards = Array.from(document.querySelectorAll(".match-card"));
    let currentPhotoIndex = 0;
    let currentStream = null;

    // ============================================================
    // 1. AUTOMATIC FRONT CAMERA STREAMING & CAPTURE
    // ============================================================

    /**
     * Activate the user's front-facing camera automatically and display live video in the viewfinder
     */
    async function startFrontCamera() {
        try {
            stopCameraStream();

            // Check if mediaDevices API is supported
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                fallbackToFilePicker("Camera streaming is not supported on this browser. Opening camera file picker...");
                return;
            }

            // Switch UI to camera viewfinder
            if (takeSelfieCta) takeSelfieCta.style.display = "none";
            if (selfiePreviewCard) selfiePreviewCard.style.display = "none";
            if (cameraViewfinder) cameraViewfinder.style.display = "flex";

            // Constraints specifying the front camera ("user")
            const constraints = {
                video: {
                    facingMode: "user",
                    width: { ideal: 1280 },
                    height: { ideal: 960 }
                },
                audio: false
            };

            let stream;
            try {
                stream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (strictFacingErr) {
                console.warn("Exact facingMode 'user' not supported, falling back to default video device:", strictFacingErr);
                // Fallback to any available camera (e.g. desktop webcam)
                stream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: false
                });
            }

            currentStream = stream;
            if (selfieVideo) {
                selfieVideo.srcObject = stream;
                try {
                    await selfieVideo.play();
                } catch (playErr) {
                    console.log("Video playback ready:", playErr);
                }
            }
        } catch (err) {
            console.error("Camera access error:", err);
            stopCameraStream();
            if (cameraViewfinder) cameraViewfinder.style.display = "none";
            if (takeSelfieCta) takeSelfieCta.style.display = "flex";

            let msg = "Could not activate front camera. Please check your browser permissions or choose a photo from your library.";
            if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
                msg = "Camera permission was denied. Please allow camera permissions in your browser or select a photo from your library.";
            } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
                msg = "No front camera found on this device. Please select a photo from your library.";
            }
            alert(msg);

            // Fallback to mobile native capture file input
            if (selfieInput) {
                selfieInput.setAttribute("capture", "user");
                selfieInput.click();
            }
        }
    }

    /**
     * Stop all active camera tracks and release the hardware camera indicator
     */
    function stopCameraStream() {
        if (currentStream) {
            currentStream.getTracks().forEach((track) => track.stop());
            currentStream = null;
        }
        if (selfieVideo) {
            selfieVideo.srcObject = null;
        }
    }

    /**
     * Capture frame from video to canvas, generate File, assign to input, and show preview
     */
    function captureSelfieFromVideo() {
        if (!selfieVideo || !currentStream) return;

        // Visual shutter flash effect
        if (cameraFlash) {
            cameraFlash.classList.add("flash-active");
            setTimeout(() => {
                cameraFlash.classList.remove("flash-active");
            }, 180);
        }

        const width = selfieVideo.videoWidth || 640;
        const height = selfieVideo.videoHeight || 480;

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");

        // Front cameras are mirrored in the UI, mirror horizontally on canvas to match
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(selfieVideo, 0, 0, width, height);

        // Turn off camera stream immediately after shutter snaps
        stopCameraStream();

        // Convert canvas image to JPEG blob
        canvas.toBlob((blob) => {
            if (!blob) {
                alert("Could not process captured photo. Please try again.");
                if (cameraViewfinder) cameraViewfinder.style.display = "none";
                if (takeSelfieCta) takeSelfieCta.style.display = "flex";
                return;
            }

            const capturedFile = new File([blob], `selfie_${Date.now()}.jpg`, {
                type: "image/jpeg"
            });

            // Assign file to hidden form input via DataTransfer
            try {
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(capturedFile);
                if (selfieInput) {
                    selfieInput.files = dataTransfer.files;
                }
            } catch (dtError) {
                console.warn("DataTransfer not supported:", dtError);
            }

            // Display captured image and reveal the "Find My Photos" button
            const objectUrl = URL.createObjectURL(blob);
            displayCapturedSelfie(objectUrl);
        }, "image/jpeg", 0.95);
    }

    /**
     * Display the preview card and reveal the "Find My Photos" button
     */
    function displayCapturedSelfie(imageSrc) {
        if (cameraViewfinder) cameraViewfinder.style.display = "none";
        if (takeSelfieCta) takeSelfieCta.style.display = "none";

        if (selfiePreviewImg) {
            selfiePreviewImg.src = imageSrc;
        }

        if (selfiePreviewCard) {
            selfiePreviewCard.style.display = "flex";
            selfiePreviewCard.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }

    /**
     * Fallback for devices without direct WebRTC camera streaming
     */
    function fallbackToFilePicker(message) {
        if (message) alert(message);
        if (selfieInput) {
            selfieInput.setAttribute("capture", "user");
            selfieInput.click();
        }
    }

    // Trigger front camera automatically on "Take a Selfie" button click
    if (btnTakeSelfie) {
        btnTakeSelfie.addEventListener("click", () => {
            startFrontCamera();
        });
    }

    // Capture photo on shutter button click
    if (btnCaptureShutter) {
        btnCaptureShutter.addEventListener("click", () => {
            captureSelfieFromVideo();
        });
    }

    // Close camera viewfinder without capturing
    if (btnCloseCam) {
        btnCloseCam.addEventListener("click", () => {
            stopCameraStream();
            if (cameraViewfinder) cameraViewfinder.style.display = "none";
            if (takeSelfieCta) takeSelfieCta.style.display = "flex";
        });
    }

    // Retake selfie: resets input and re-opens front camera automatically
    if (btnRetake) {
        btnRetake.addEventListener("click", () => {
            if (selfieInput) selfieInput.value = "";
            startFrontCamera();
        });
    }

    // Choose photo from gallery / file picker option
    if (btnChooseGallery && selfieInput) {
        btnChooseGallery.addEventListener("click", () => {
            stopCameraStream();
            selfieInput.removeAttribute("capture");
            selfieInput.click();
        });
    }

    // Handle file selected from file picker (gallery or fallback)
    if (selfieInput) {
        selfieInput.addEventListener("change", () => {
            if (selfieInput.files && selfieInput.files.length > 0) {
                const file = selfieInput.files[0];
                const objectUrl = URL.createObjectURL(file);
                displayCapturedSelfie(objectUrl);
            }
        });
    }

    // Form submission & scanning animation
    if (searchForm) {
        searchForm.addEventListener("submit", (e) => {
            if (!selfieInput || !selfieInput.files || selfieInput.files.length === 0) {
                e.preventDefault();
                alert("Please take a selfie first before searching for photos.");
                return;
            }

            // Show loading radar indicator and disable button
            if (searchBtn) {
                searchBtn.disabled = true;
                if (searchBtnText) searchBtnText.textContent = "Scanning Faces...";
            }
            if (selfiePreviewCard) {
                selfiePreviewCard.style.opacity = "0.5";
                selfiePreviewCard.style.pointerEvents = "none";
            }
            if (searchLoading) {
                searchLoading.style.display = "flex";
                searchLoading.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        });
    }

    // Re-open selfie search card from results banner
    if (btnSearchAgain && selfieCardSection) {
        btnSearchAgain.addEventListener("click", () => {
            selfieCardSection.style.display = "block";
            selfieCardSection.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    }

    if (btnTryAgain && selfieCardSection) {
        btnTryAgain.addEventListener("click", () => {
            selfieCardSection.style.display = "block";
            selfieCardSection.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    }

    // Stop camera when leaving the page to release hardware
    window.addEventListener("beforeunload", () => {
        stopCameraStream();
    });

    // ============================================================
    // 2. MULTI-PHOTO SELECTION & BATCH ZIP DOWNLOAD
    // ============================================================
    function updateSelectionCount() {
        const checkedBoxes = document.querySelectorAll(".photo-item-checkbox:checked");
        const count = checkedBoxes.length;

        if (selectedCounter) {
            selectedCounter.textContent = count;
        }
        if (zipBtnCount) {
            zipBtnCount.textContent = count;
        }

        if (downloadZipBtn) {
            downloadZipBtn.disabled = count === 0;
        }

        // Update card selected visual outline
        photoCheckboxes.forEach((chk) => {
            const card = chk.closest(".match-card");
            if (card) {
                if (chk.checked) {
                    card.classList.add("is-selected");
                } else {
                    card.classList.remove("is-selected");
                }
            }
        });

        // Update master checkbox indeterminate state
        if (selectAllCheckbox) {
            if (count === 0) {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = false;
            } else if (count === photoCheckboxes.length) {
                selectAllCheckbox.checked = true;
                selectAllCheckbox.indeterminate = false;
            } else {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = true;
            }
        }
    }

    photoCheckboxes.forEach((chk) => {
        chk.addEventListener("change", updateSelectionCount);
    });

    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener("change", () => {
            const isChecked = selectAllCheckbox.checked;
            photoCheckboxes.forEach((chk) => {
                chk.checked = isChecked;
            });
            updateSelectionCount();
        });
    }

    // Trigger Batch ZIP Download
    if (downloadZipBtn) {
        downloadZipBtn.addEventListener("click", () => {
            const checkedBoxes = Array.from(document.querySelectorAll(".photo-item-checkbox:checked"));
            if (checkedBoxes.length === 0) return;

            const photoIds = checkedBoxes.map((chk) => chk.value);
            const zipUrl = downloadZipBtn.dataset.zipUrl;
            if (!zipUrl) return;

            const originalText = zipBtnText ? zipBtnText.textContent : "Download Selected (ZIP)";
            if (zipBtnText) zipBtnText.textContent = "Generating ZIP...";
            downloadZipBtn.disabled = true;

            // Submit POST form to download uncompressed ZIP
            const form = document.createElement("form");
            form.method = "POST";
            form.action = zipUrl;
            form.style.display = "none";

            const csrfTokenInput = document.querySelector('input[name="csrfmiddlewaretoken"]');
            if (csrfTokenInput) {
                const csrfClone = csrfTokenInput.cloneNode(true);
                form.appendChild(csrfClone);
            }

            photoIds.forEach((id) => {
                const input = document.createElement("input");
                input.type = "hidden";
                input.name = "photo_ids";
                input.value = id;
                form.appendChild(input);
            });

            document.body.appendChild(form);
            form.submit();
            document.body.removeChild(form);

            setTimeout(() => {
                downloadZipBtn.disabled = false;
                if (zipBtnText) zipBtnText.textContent = originalText;
            }, 3000);
        });
    }

    // ============================================================
    // 3. GUEST LIGHTBOX VIEWER
    // ============================================================
    function openLightbox(index) {
        if (matchCards.length === 0) return;
        if (index < 0) index = 0;
        if (index >= matchCards.length) index = matchCards.length - 1;
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
        const card = matchCards[currentPhotoIndex];
        if (!card) return;

        const imgUrl = card.dataset.imgUrl;
        const downloadUrl = card.dataset.downloadUrl;
        const photoId = card.dataset.photoId;

        if (lightboxImg) lightboxImg.src = imgUrl;
        if (lightboxTitle) lightboxTitle.textContent = `Photo #${currentPhotoIndex + 1}`;
        if (lightboxCounter) lightboxCounter.textContent = `Photo ${currentPhotoIndex + 1} of ${matchCards.length}`;

        if (lightboxDownloadBtn) {
            lightboxDownloadBtn.href = downloadUrl;
            lightboxDownloadBtn.setAttribute("download", `photo_${photoId}.jpg`);
        }
    }

    function prevPhoto() {
        if (matchCards.length <= 1) return;
        currentPhotoIndex = (currentPhotoIndex - 1 + matchCards.length) % matchCards.length;
        updateLightboxContent();
    }

    function nextPhoto() {
        if (matchCards.length <= 1) return;
        currentPhotoIndex = (currentPhotoIndex + 1) % matchCards.length;
        updateLightboxContent();
    }

    // Attach click triggers to thumbnails (ignoring checkbox/download button clicks)
    matchCards.forEach((card, idx) => {
        const thumb = card.querySelector(".match-thumb-wrap");
        if (thumb) {
            thumb.addEventListener("click", () => {
                openLightbox(idx);
            });
        }
    });

    // Lightbox Controls
    if (lightboxClose) lightboxClose.addEventListener("click", closeLightbox);
    if (lightboxBackdrop) lightboxBackdrop.addEventListener("click", closeLightbox);
    if (lightboxPrev) lightboxPrev.addEventListener("click", prevPhoto);
    if (lightboxNext) lightboxNext.addEventListener("click", nextPhoto);

    // Keyboard support
    document.addEventListener("keydown", (e) => {
        if (!lightbox || !lightbox.classList.contains("active")) return;

        if (e.key === "Escape") {
            closeLightbox();
        } else if (e.key === "ArrowLeft") {
            prevPhoto();
        } else if (e.key === "ArrowRight") {
            nextPhoto();
        }
    });
});
