/* ============================================================
   PHOTONA - DASHBOARD LOGIC, POLLING & MODAL INTERACTIONS (v3.3)
   ============================================================ */

document.addEventListener("DOMContentLoaded", function () {

    /* =========================================================
       MODAL CONTROLLER (Create, Edit, Delete)
    ========================================================== */

    function openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add("active");
            modal.setAttribute("aria-hidden", "false");
            const firstInput = modal.querySelector("input:not([type=hidden]), textarea");
            if (firstInput) {
                setTimeout(() => firstInput.focus(), 80);
            }
        }
    }

    function closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove("active");
            modal.setAttribute("aria-hidden", "true");
        }
    }

    // Trigger buttons for Create Event Modal
    document.querySelectorAll(".btn-trigger-create-event, [data-open-modal='create-event-modal']").forEach(function (btn) {
        btn.addEventListener("click", function (e) {
            e.preventDefault();
            openModal("create-event-modal");
        });
    });

    // Close button listeners
    document.querySelectorAll("[data-close-modal]").forEach(function (btn) {
        btn.addEventListener("click", function () {
            const modalId = btn.getAttribute("data-close-modal");
            closeModal(modalId);
        });
    });

    // Backdrop click to close
    document.querySelectorAll(".modal-dialog-backdrop").forEach(function (backdrop) {
        backdrop.addEventListener("click", function (e) {
            if (e.target === backdrop) {
                backdrop.classList.remove("active");
                backdrop.setAttribute("aria-hidden", "true");
            }
        });
    });

    // Keyboard ESC key to close
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
            document.querySelectorAll(".modal-dialog-backdrop.active").forEach(function (modal) {
                modal.classList.remove("active");
                modal.setAttribute("aria-hidden", "true");
            });
        }
    });

    // Edit Event button handler (Point 7 Fix)
    const editModal = document.getElementById("edit-event-modal");
    const editForm = document.getElementById("edit-event-form");
    const editNameInput = document.getElementById("edit_event_name");
    const editDescInput = document.getElementById("edit_event_desc");
    const editDateInput = document.getElementById("edit_event_date");
    let currentEditingEventId = null;

    document.querySelectorAll(".btn-trigger-edit-event").forEach(function (btn) {
        btn.addEventListener("click", function (e) {
            e.stopPropagation();
            const editUrl = btn.getAttribute("data-edit-url");
            const eventId = btn.getAttribute("data-event-id");
            const name = btn.getAttribute("data-event-name") || "";
            const desc = btn.getAttribute("data-event-desc") || "";
            const date = btn.getAttribute("data-event-date") || "";

            currentEditingEventId = eventId;

            if (editForm) {
                editForm.action = editUrl;
            }
            if (editNameInput) editNameInput.value = name;
            if (editDescInput) editDescInput.value = desc;
            if (editDateInput) editDateInput.value = date;

            openModal("edit-event-modal");
        });
    });

    // AJAX submit for Edit Event on Dashboard for seamless experience
    if (editForm) {
        editForm.addEventListener("submit", async function (e) {
            e.preventDefault();
            const submitBtn = editForm.querySelector("button[type=submit]");
            if (submitBtn) submitBtn.disabled = true;

            const formData = new FormData(editForm);

            try {
                const response = await fetch(editForm.action, {
                    method: "POST",
                    body: formData,
                    headers: {
                        "X-Requested-With": "XMLHttpRequest"
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.success) {
                        // Dynamically update card on dashboard
                        if (currentEditingEventId) {
                            const titleEl = document.getElementById(`card-title-${currentEditingEventId}`);
                            const descEl = document.getElementById(`card-desc-${currentEditingEventId}`);
                            const dateEl = document.getElementById(`card-date-${currentEditingEventId}`);
                            const thumbEl = document.getElementById(`card-thumb-${currentEditingEventId}`);

                            if (titleEl) titleEl.textContent = data.name;
                            if (descEl) {
                                descEl.textContent = data.description || "No event description provided";
                                if (data.description) descEl.classList.remove("text-muted-empty");
                                else descEl.classList.add("text-muted-empty");
                            }
                            if (dateEl) {
                                dateEl.textContent = data.event_date || "Date not set";
                            }
                            if (thumbEl && data.thumbnail_url) {
                                thumbEl.src = data.thumbnail_url;
                            }
                        }
                        closeModal("edit-event-modal");
                    }
                } else {
                    // Fallback to normal form submit if needed
                    editForm.submit();
                }
            } catch (err) {
                // Fallback normal submit
                editForm.submit();
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }

    // Delete Event button handler
    const deleteForm = document.getElementById("delete-event-form");
    const deleteModalEventName = document.getElementById("delete-modal-event-name");

    document.querySelectorAll(".btn-trigger-delete-event").forEach(function (btn) {
        btn.addEventListener("click", function (e) {
            e.stopPropagation();
            const deleteUrl = btn.getAttribute("data-delete-url");
            const eventName = btn.getAttribute("data-event-name") || "this event";

            if (deleteForm) {
                deleteForm.action = deleteUrl;
            }
            if (deleteModalEventName) {
                deleteModalEventName.textContent = `"${eventName}"`;
            }

            openModal("delete-event-modal");
        });
    });

    // Mobile Sidebar Toggle
    const mobileMenuBtn = document.getElementById("mobile-menu-btn");
    const sidebar = document.getElementById("sidebar");
    const sidebarOverlay = document.getElementById("sidebar-overlay");

    if (mobileMenuBtn && sidebar) {
        mobileMenuBtn.addEventListener("click", function () {
            sidebar.classList.toggle("open");
            if (sidebarOverlay) sidebarOverlay.classList.toggle("active");
        });
    }

    if (sidebarOverlay && sidebar) {
        sidebarOverlay.addEventListener("click", function () {
            sidebar.classList.remove("open");
            sidebarOverlay.classList.remove("active");
        });
    }

    /* =========================================================
       STATISTICS REFRESH
    ========================================================== */
    const totalEventsElement = document.getElementById("total-events");
    const activeEventsElement = document.getElementById("active-events");
    const totalPhotosElement = document.getElementById("total-photos");
    const processingPhotosElement = document.getElementById("processing-photos");

    function updateDashboardStatistics() {
        fetch("/dashboard/stats/", {
            method: "GET",
            headers: {
                "X-Requested-With": "XMLHttpRequest"
            }
        })
        .then(function (response) {
            if (!response.ok) throw new Error("Stats request failed");
            return response.json();
        })
        .then(function (data) {
            if (totalEventsElement && data.total_events !== undefined) {
                totalEventsElement.textContent = data.total_events;
            }
            if (activeEventsElement && data.active_events !== undefined) {
                activeEventsElement.textContent = data.active_events;
            }
            if (totalPhotosElement && data.total_photos !== undefined) {
                totalPhotosElement.textContent = data.total_photos;
            }
            if (processingPhotosElement && data.processing_photos !== undefined) {
                processingPhotosElement.textContent = data.processing_photos;
            }
        })
        .catch(function () {});
    }

    updateDashboardStatistics();
    setInterval(updateDashboardStatistics, 6000);


    /* =========================================================
       GENERIC MODAL OPENER (Supports plans-modal & others)
    ========================================================== */
    document.querySelectorAll("[data-open-modal]").forEach(function (btn) {
        btn.addEventListener("click", function (e) {
            e.preventDefault();
            const modalId = btn.getAttribute("data-open-modal");
            openModal(modalId);
        });
    });

    /* =========================================================
       NOTIFICATION BELL & DROPDOWN (Requirement 8)
    ========================================================== */
    const bellBtn = document.getElementById("btn-notification-bell");
    const notifDropdown = document.getElementById("notification-dropdown");
    const unreadBadge = document.getElementById("bell-unread-count");
    const markAllReadBtn = document.getElementById("btn-mark-all-read");

    if (bellBtn && notifDropdown) {
        bellBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            const isActive = notifDropdown.classList.toggle("active");
            bellBtn.classList.toggle("active", isActive);
            bellBtn.setAttribute("aria-expanded", isActive ? "true" : "false");
            notifDropdown.setAttribute("aria-hidden", isActive ? "false" : "true");
        });

        // Close on click outside
        document.addEventListener("click", function (e) {
            if (!notifDropdown.contains(e.target) && !bellBtn.contains(e.target)) {
                notifDropdown.classList.remove("active");
                bellBtn.classList.remove("active");
                bellBtn.setAttribute("aria-expanded", "false");
                notifDropdown.setAttribute("aria-hidden", "true");
            }
        });

        if (markAllReadBtn) {
            markAllReadBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                document.querySelectorAll(".notif-item.unread").forEach(function (item) {
                    item.classList.remove("unread");
                });
                if (unreadBadge) unreadBadge.style.display = "none";
                const chip = document.querySelector(".notif-unread-chip");
                if (chip) chip.textContent = "0 new";
                markAllReadBtn.style.display = "none";
            });
        }
    }

    /* =========================================================
       3-SLIDE INTERACTIVE BANNER CAROUSEL (Requirements 5, 6, 7)
    ========================================================== */
    const bannerCarousel = document.getElementById("dashboard-banner-carousel");
    const bannerSlides = Array.from(document.querySelectorAll(".banner-slide"));
    const bannerDots = Array.from(document.querySelectorAll(".banner-dot"));
    const btnBannerPrev = document.getElementById("banner-prev-btn");
    const btnBannerNext = document.getElementById("banner-next-btn");

    if (bannerCarousel && bannerSlides.length > 0) {
        let currentSlideIndex = 0;
        let bannerAutoPlayTimer = null;

        function goToSlide(index) {
            if (index < 0) {
                currentSlideIndex = bannerSlides.length - 1;
            } else if (index >= bannerSlides.length) {
                currentSlideIndex = 0;
            } else {
                currentSlideIndex = index;
            }

            bannerSlides.forEach(function (slide, idx) {
                if (idx === currentSlideIndex) {
                    slide.classList.add("active");
                } else {
                    slide.classList.remove("active");
                }
            });

            bannerDots.forEach(function (dot, idx) {
                if (idx === currentSlideIndex) {
                    dot.classList.add("active");
                } else {
                    dot.classList.remove("active");
                }
            });
        }

        function startAutoPlay() {
            stopAutoPlay();
            bannerAutoPlayTimer = setInterval(function () {
                goToSlide(currentSlideIndex + 1);
            }, 5000);
        }

        function stopAutoPlay() {
            if (bannerAutoPlayTimer) {
                clearInterval(bannerAutoPlayTimer);
                bannerAutoPlayTimer = null;
            }
        }

        if (btnBannerNext) {
            btnBannerNext.addEventListener("click", function () {
                goToSlide(currentSlideIndex + 1);
                startAutoPlay();
            });
        }

        if (btnBannerPrev) {
            btnBannerPrev.addEventListener("click", function () {
                goToSlide(currentSlideIndex - 1);
                startAutoPlay();
            });
        }

        bannerDots.forEach(function (dot) {
            dot.addEventListener("click", function () {
                const targetIdx = parseInt(dot.getAttribute("data-slide-index"), 10);
                if (!isNaN(targetIdx)) {
                    goToSlide(targetIdx);
                    startAutoPlay();
                }
            });
        });

        // Pause auto-play on hover, resume on mouse leave
        bannerCarousel.addEventListener("mouseenter", stopAutoPlay);
        bannerCarousel.addEventListener("mouseleave", startAutoPlay);

        // Start auto-play initially
        startAutoPlay();
    }

});
