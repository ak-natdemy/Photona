document.addEventListener("DOMContentLoaded", () => {

    // =========================================
    // ELEMENTS
    // =========================================

    const password = document.getElementById("password");
    const togglePassword = document.getElementById("toggle-password");

    const loginForm = document.getElementById("login-form");
    const loginButton = document.getElementById("login-button");


    // =========================================
    // SHOW / HIDE PASSWORD
    // =========================================

    togglePassword.addEventListener("click", () => {

        const isPasswordHidden = password.type === "password";

        password.type = isPasswordHidden ? "text" : "password";
        togglePassword.textContent = isPasswordHidden ? "Hide" : "Show";

    });


    // =========================================
    // PREVENT DOUBLE SUBMISSION
    // =========================================

    loginForm.addEventListener("submit", () => {

        loginButton.disabled = true;
        loginButton.textContent = "Logging in...";

    });


    // =========================================
    // RESET BUTTON WHEN PAGE IS RESTORED
    // =========================================

    window.addEventListener("pageshow", () => {

        loginButton.disabled = false;
        loginButton.textContent = "Login";

    });

});