document.addEventListener("DOMContentLoaded", function () {

    console.log("Photona Dashboard JS Loaded");


    /* =========================================================
       MOBILE SIDEBAR
    ========================================================== */

    const sidebar =
        document.querySelector(".sidebar");

    const menuButton =
        document.querySelector(".mobile-menu-button");

    const sidebarOverlay =
        document.querySelector(".sidebar-overlay");


    function openSidebar() {

        if (!sidebar) {
            return;
        }

        sidebar.classList.add(
            "sidebar-open"
        );

        if (sidebarOverlay) {

            sidebarOverlay.classList.add(
                "overlay-visible"
            );

        }

    }


    function closeSidebar() {

        if (!sidebar) {
            return;
        }

        sidebar.classList.remove(
            "sidebar-open"
        );

        if (sidebarOverlay) {

            sidebarOverlay.classList.remove(
                "overlay-visible"
            );

        }

    }


    if (menuButton) {

        menuButton.addEventListener(
            "click",
            function () {

                if (
                    sidebar.classList.contains(
                        "sidebar-open"
                    )
                ) {

                    closeSidebar();

                } else {

                    openSidebar();

                }

            }
        );

    }



    /* =========================================================
       SIDEBAR NAVIGATION
    ========================================================== */

    const navigationItems =
        document.querySelectorAll(
            ".nav-item"
        );


    navigationItems.forEach(
        function (item) {

            item.addEventListener(
                "click",
                function () {

                    closeSidebar();

                }
            );

        }
    );



    /* =========================================================
       LOGOUT CONFIRMATION
    ========================================================== */

    const logoutLink =
        document.querySelector(
            ".logout-link"
        );


    if (logoutLink) {

        logoutLink.addEventListener(
            "click",
            function (event) {

                event.preventDefault();


                const confirmLogout =
                    window.confirm(
                        "Are you sure you want to logout?"
                    );


                if (confirmLogout) {

                    window.location.href =
                        logoutLink.href;

                }

            }
        );

    }



    /* =========================================================
       ESC KEY
    ========================================================== */

    document.addEventListener(
        "keydown",
        function (event) {

            if (event.key === "Escape") {

                closeSidebar();

            }

        }
    );



    /* =========================================================
       WINDOW RESIZE
    ========================================================== */

    window.addEventListener(
        "resize",
        function () {

            if (window.innerWidth > 650) {

                closeSidebar();

            }

        }
    );



    /* =========================================================
       DASHBOARD STATISTICS
    ========================================================== */

    const totalEventsElement =
        document.getElementById(
            "total-events"
        );

    const activeEventsElement =
        document.getElementById(
            "active-events"
        );

    const totalPhotosElement =
        document.getElementById(
            "total-photos"
        );

    const processingPhotosElement =
        document.getElementById(
            "processing-photos"
        );



    /*
     * Django URL for dashboard statistics.
     *
     * Example:
     * /dashboard/stats/
     */

    const dashboardStatsUrl =
        "/dashboard/stats/";



    function updateDashboardStatistics() {

        fetch(
            dashboardStatsUrl,
            {
                method: "GET",

                headers: {
                    "X-Requested-With": "XMLHttpRequest"
                }
            }
        )

        .then(
            function (response) {

                if (!response.ok) {

                    throw new Error(
                        "Failed to fetch dashboard statistics."
                    );

                }

                return response.json();

            }
        )

        .then(
            function (data) {


                /* ==============================
                   TOTAL EVENTS
                =============================== */

                if (totalEventsElement) {

                    totalEventsElement.textContent =
                        data.total_events;

                }



                /* ==============================
                   ACTIVE EVENTS
                =============================== */

                if (activeEventsElement) {

                    activeEventsElement.textContent =
                        data.active_events;

                }



                /* ==============================
                   TOTAL PHOTOS
                =============================== */

                if (totalPhotosElement) {

                    totalPhotosElement.textContent =
                        data.total_photos;

                }



                /* ==============================
                   PROCESSING PHOTOS
                =============================== */

                if (processingPhotosElement) {

                    processingPhotosElement.textContent =
                        data.processing_photos;

                }

            }
        )

        .catch(
            function (error) {

                console.error(
                    "Dashboard statistics update failed:",
                    error
                );

            }
        );

    }



    /* =========================================================
       INITIAL DASHBOARD STATISTICS CHECK
    ========================================================== */

    updateDashboardStatistics();



    /* =========================================================
       AUTOMATIC DASHBOARD STATISTICS REFRESH
    ========================================================== */

    setInterval(
        function () {

            updateDashboardStatistics();

        },
        5000
    );



    /* =========================================================
       EVENT CARDS
    ========================================================== */

    const eventCards =
        document.querySelectorAll(
            ".event-card"
        );



    /* =========================================================
       AI STATUS HTML
    ========================================================== */

    function getStatusHTML(status) {


        if (status === "ready") {

            return `
                <span class="status-ready">
                    ● Ready
                </span>
            `;

        }


        if (status === "processing") {

            return `
                <span class="status-processing">
                    ● Processing
                </span>
            `;

        }


        if (status === "failed") {

            return `
                <span class="status-failed">
                    ● Failed
                </span>
            `;

        }


        return `
            <span class="status-pending">
                ● Waiting
            </span>
        `;

    }



    /* =========================================================
       UPDATE EVENT DATA
    ========================================================== */

    function updateEventData(eventCard) {


        const statusUrl =
            eventCard.dataset.statusUrl;


        const statusElement =
            eventCard.querySelector(
                "[data-ai-status]"
            );


        const photoCountElement =
            eventCard.querySelector(
                "[data-photo-count]"
            );


        const photoLabelElement =
            eventCard.querySelector(
                "[data-photo-label]"
            );


        if (!statusUrl) {

            return;

        }



        fetch(
            statusUrl,
            {
                method: "GET",

                headers: {
                    "X-Requested-With": "XMLHttpRequest"
                }
            }
        )

        .then(
            function (response) {

                if (!response.ok) {

                    throw new Error(
                        "Failed to fetch event status."
                    );

                }

                return response.json();

            }
        )

        .then(
            function (data) {


                /* ==============================
                   UPDATE AI STATUS
                =============================== */

                if (statusElement) {

                    statusElement.innerHTML =
                        getStatusHTML(
                            data.ai_status
                        );

                }



                /* ==============================
                   UPDATE EVENT PHOTO COUNT
                =============================== */

                if (photoCountElement) {

                    const photoCount =
                        data.photos
                            ? data.photos.length
                            : 0;


                    photoCountElement.textContent =
                        photoCount;


                    if (photoLabelElement) {

                        photoLabelElement.textContent =
                            photoCount === 1
                                ? "photo"
                                : "photos";

                    }

                }

            }
        )

        .catch(
            function (error) {

                console.error(
                    "Event data update failed:",
                    error
                );

            }
        );

    }



    /* =========================================================
       INITIAL EVENT STATUS CHECK
    ========================================================== */

    eventCards.forEach(
        function (eventCard) {

            updateEventData(
                eventCard
            );

        }
    );



    /* =========================================================
       AUTOMATIC EVENT STATUS REFRESH
    ========================================================== */

    setInterval(
        function () {

            eventCards.forEach(
                function (eventCard) {

                    updateEventData(
                        eventCard
                    );

                }

            );

        },
        5000
    );


});