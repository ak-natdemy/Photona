const password = document.getElementById("id_password");
const confirmPassword = document.getElementById("id_password_confirm");
const email = document.getElementById("id_email");

const toggle = (input, button) => {
    button.addEventListener("click", () => {
        input.type = input.type === "password" ? "text" : "password";
        button.textContent = input.type === "password" ? "Show" : "Hide";
    });
};

toggle(password, document.getElementById("toggle-password"));
toggle(confirmPassword, document.getElementById("toggle-password-confirm"));


password.addEventListener("input", () => {
    const length = password.value.length;
    document.getElementById("password-strength").textContent =
        length === 0 ? "" :
        length < 6 ? "Weak password" :
        length < 10 ? "Medium password" :
        "Strong password";
});


confirmPassword.addEventListener("input", () => {
    const message = document.getElementById("password-match-message");
    message.textContent = !confirmPassword.value ? "" :
        password.value === confirmPassword.value
            ? "✓ Passwords match"
            : "✗ Passwords do not match";
});


email.addEventListener("input", () => {
    const message = document.getElementById("email-validation-message");
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim());

    message.textContent = !email.value ? "" :
        valid ? "✓ Valid email format" : "✗ Invalid email format";
});


document.getElementById("registration-form").addEventListener("submit", () => {
    const button = document.getElementById("register-button");
    button.disabled = true;
    button.textContent = "Creating Account...";
});