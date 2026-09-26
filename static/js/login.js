document.addEventListener("DOMContentLoaded", () => {

    // =========================================
    // ELEMENTS
    // =========================================

    const passwordInput = document.getElementById("password");
    const togglePasswordBtn = document.getElementById("toggle-password");
    const eyeShow = togglePasswordBtn ? togglePasswordBtn.querySelector(".eye-show") : null;
    const eyeHide = togglePasswordBtn ? togglePasswordBtn.querySelector(".eye-hide") : null;

    const loginForm = document.getElementById("login-form");
    const loginButton = document.getElementById("login-button");

    const forgotModal = document.getElementById("forgot-modal");
    const openForgotBtn = document.getElementById("open-forgot-modal");
    const closeForgotBtn = document.getElementById("close-forgot-modal");
    const cancelForgotBtn = document.getElementById("cancel-forgot-modal");
    const dummyForgotForm = document.getElementById("dummy-forgot-form");
    const dummyAlert = document.getElementById("dummy-alert");
    const resetEmail = document.getElementById("reset-email");
    const btnSendReset = document.getElementById("btn-send-reset");


    // =========================================
    // EYE ICON SHOW / HIDE PASSWORD
    // =========================================

    if (togglePasswordBtn && passwordInput) {

        togglePasswordBtn.addEventListener("click", () => {

            const isPasswordHidden = passwordInput.type === "password";

            passwordInput.type = isPasswordHidden ? "text" : "password";

            if (eyeShow && eyeHide) {
                eyeShow.style.display = isPasswordHidden ? "none" : "block";
                eyeHide.style.display = isPasswordHidden ? "block" : "none";
            }

            togglePasswordBtn.setAttribute(
                "aria-label",
                isPasswordHidden ? "Hide password" : "Show password"
            );
            togglePasswordBtn.setAttribute(
                "title",
                isPasswordHidden ? "Hide password" : "Show password"
            );

            passwordInput.focus();

        });

    }


    // =========================================
    // DUMMY FORGOT PASSWORD MODAL
    // =========================================

    const openModal = () => {
        if (!forgotModal) return;
        forgotModal.classList.add("is-active");
        forgotModal.setAttribute("aria-hidden", "false");
        if (resetEmail) {
            setTimeout(() => resetEmail.focus(), 80);
        }
    };

    const closeModal = () => {
        if (!forgotModal) return;
        forgotModal.classList.remove("is-active");
        forgotModal.setAttribute("aria-hidden", "true");
        if (dummyAlert) {
            dummyAlert.style.display = "none";
            dummyAlert.textContent = "";
        }
        if (dummyForgotForm) dummyForgotForm.reset();
        if (btnSendReset) {
            btnSendReset.disabled = false;
            btnSendReset.textContent = "Send Instructions";
        }
    };

    if (openForgotBtn) {
        openForgotBtn.addEventListener("click", openModal);
    }

    if (closeForgotBtn) {
        closeForgotBtn.addEventListener("click", closeModal);
    }

    if (cancelForgotBtn) {
        cancelForgotBtn.addEventListener("click", closeModal);
    }

    if (forgotModal) {
        forgotModal.addEventListener("click", (e) => {
            if (e.target === forgotModal) {
                closeModal();
            }
        });
    }

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && forgotModal && forgotModal.classList.contains("is-active")) {
            closeModal();
        }
    });

    if (dummyForgotForm) {
        dummyForgotForm.addEventListener("submit", (e) => {
            e.preventDefault();

            const emailVal = resetEmail ? resetEmail.value.trim() : "";
            if (!emailVal) return;

            if (btnSendReset) {
                btnSendReset.disabled = true;
                btnSendReset.textContent = "Sending...";
            }

            setTimeout(() => {
                if (dummyAlert) {
                    dummyAlert.style.display = "block";
                    dummyAlert.textContent = `✓ Recovery link sent to ${emailVal} (Demo Mode).`;
                }
                if (btnSendReset) {
                    btnSendReset.textContent = "Sent!";
                }

                setTimeout(() => {
                    closeModal();
                }, 2200);
            }, 800);
        });
    }


    // =========================================
    // PREVENT DOUBLE SUBMISSION
    // =========================================

    if (loginForm && loginButton) {

        loginForm.addEventListener("submit", () => {

            loginButton.disabled = true;
            loginButton.textContent = "Logging in...";

        });

    }


    // =========================================
    // RESET BUTTON WHEN PAGE IS RESTORED
    // =========================================

    window.addEventListener("pageshow", () => {

        if (loginButton) {
            loginButton.disabled = false;
            loginButton.textContent = "Login";
        }

    });

});
