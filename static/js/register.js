document.addEventListener("DOMContentLoaded", () => {
    const password = document.getElementById("id_password");
    const confirmPassword = document.getElementById("id_password_confirm");
    const email = document.getElementById("id_email");

    const togglePasswordBtn = document.getElementById("toggle-password");
    const toggleConfirmBtn = document.getElementById("toggle-password-confirm");

    // Toggle Password Visibility with Eye Icon
    const setupEyeToggle = (input, button) => {
        if (!input || !button) return;

        const eyeShow = button.querySelector(".eye-show");
        const eyeHide = button.querySelector(".eye-hide");

        button.addEventListener("click", () => {
            const isHidden = input.type === "password";
            input.type = isHidden ? "text" : "password";

            if (eyeShow && eyeHide) {
                eyeShow.style.display = isHidden ? "none" : "block";
                eyeHide.style.display = isHidden ? "block" : "none";
            }

            button.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
            button.setAttribute("title", isHidden ? "Hide password" : "Show password");

            input.focus();
        });
    };

    setupEyeToggle(password, togglePasswordBtn);
    setupEyeToggle(confirmPassword, toggleConfirmBtn);

    // Password Strength Feedback
    if (password) {
        password.addEventListener("input", () => {
            const strengthMsg = document.getElementById("password-strength");
            if (!strengthMsg) return;

            const len = password.value.length;
            strengthMsg.className = "validation-msg";

            if (len === 0) {
                strengthMsg.textContent = "";
            } else if (len < 6) {
                strengthMsg.textContent = "• Weak password (minimum 8 characters recommended)";
                strengthMsg.classList.add("strength-weak");
            } else if (len < 10) {
                strengthMsg.textContent = "• Medium password strength";
                strengthMsg.classList.add("strength-medium");
            } else {
                strengthMsg.textContent = "✓ Strong password";
                strengthMsg.classList.add("strength-strong");
            }
        });
    }

    // Password Match Feedback
    const checkPasswordMatch = () => {
        const matchMsg = document.getElementById("password-match-message");
        if (!matchMsg || !confirmPassword || !password) return;

        matchMsg.className = "validation-msg";

        if (!confirmPassword.value) {
            matchMsg.textContent = "";
        } else if (password.value === confirmPassword.value) {
            matchMsg.textContent = "✓ Passwords match";
            matchMsg.classList.add("is-valid");
        } else {
            matchMsg.textContent = "✕ Passwords do not match";
            matchMsg.classList.add("is-invalid");
        }
    };

    if (confirmPassword) {
        confirmPassword.addEventListener("input", checkPasswordMatch);
    }
    if (password) {
        password.addEventListener("input", checkPasswordMatch);
    }

    // Email Format Validation Feedback
    if (email) {
        email.addEventListener("input", () => {
            const emailMsg = document.getElementById("email-validation-message");
            if (!emailMsg) return;

            const val = email.value.trim();
            emailMsg.className = "validation-msg";

            if (!val) {
                emailMsg.textContent = "";
            } else {
                const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
                if (isValid) {
                    emailMsg.textContent = "✓ Valid email format";
                    emailMsg.classList.add("is-valid");
                } else {
                    emailMsg.textContent = "✕ Invalid email format";
                    emailMsg.classList.add("is-invalid");
                }
            }
        });
    }

    // Double Submission Prevention
    const regForm = document.getElementById("registration-form");
    const regButton = document.getElementById("register-button");

    if (regForm && regButton) {
        regForm.addEventListener("submit", () => {
            regButton.disabled = true;
            regButton.textContent = "Creating Account...";
        });
    }

    // Reset button on back navigation
    window.addEventListener("pageshow", () => {
        if (regButton) {
            regButton.disabled = false;
            regButton.textContent = "Create Account";
        }
    });
});
