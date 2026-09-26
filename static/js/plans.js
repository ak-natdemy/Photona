document.addEventListener("DOMContentLoaded", () => {
    // ============================================================
    // BILLING TOGGLE (MONTHLY / ANNUAL)
    // ============================================================
    const billingToggle = document.getElementById("billing-toggle");
    const priceVals = document.querySelectorAll(".price-val");
    const annualNotes = document.querySelectorAll(".annual-note");

    let isAnnual = false;

    if (billingToggle) {
        billingToggle.addEventListener("click", () => {
            isAnnual = !isAnnual;
            billingToggle.classList.toggle("is-annual", isAnnual);
            billingToggle.setAttribute("aria-pressed", isAnnual.toString());

            priceVals.forEach((val) => {
                const targetPrice = isAnnual ? val.dataset.annual : val.dataset.monthly;
                if (targetPrice) {
                    val.textContent = targetPrice;
                }
            });

            annualNotes.forEach((note) => {
                note.style.display = isAnnual ? "block" : "none";
            });
        });
    }

    // ============================================================
    // FAQ ACCORDION
    // ============================================================
    const faqTriggers = document.querySelectorAll(".faq-trigger");

    faqTriggers.forEach((trigger) => {
        trigger.addEventListener("click", () => {
            const item = trigger.closest(".faq-item");
            const isOpen = item.classList.contains("is-open");

            // Close other items
            document.querySelectorAll(".faq-item").forEach((other) => {
                if (other !== item) other.classList.remove("is-open");
            });

            item.classList.toggle("is-open", !isOpen);
            trigger.setAttribute("aria-expanded", (!isOpen).toString());
        });
    });

    // ============================================================
    // PAYMENT METHOD SELECTION
    // ============================================================
    const payOptions = document.querySelectorAll(".pay-option");

    payOptions.forEach((option) => {
        option.addEventListener("click", () => {
            payOptions.forEach((opt) => opt.classList.remove("selected"));
            option.classList.add("selected");
            const radio = option.querySelector("input[type=radio]");
            if (radio) radio.checked = true;
        });
    });

    // ============================================================
    // MOBILE MENU TOGGLE
    // ============================================================
    const mobileMenuBtn = document.getElementById("mobile-menu-btn");
    const sidebar = document.getElementById("sidebar");
    const sidebarOverlay = document.getElementById("sidebar-overlay");

    if (mobileMenuBtn && sidebar && sidebarOverlay) {
        mobileMenuBtn.addEventListener("click", () => {
            sidebar.classList.toggle("is-open");
            sidebarOverlay.classList.toggle("is-open");
        });

        sidebarOverlay.addEventListener("click", () => {
            sidebar.classList.remove("is-open");
            sidebarOverlay.classList.remove("is-open");
        });
    }

    // Close modal on Escape key
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeCheckoutModal();
        }
    });

    // Close modal on backdrop click
    const checkoutModal = document.getElementById("checkout-modal");
    if (checkoutModal) {
        checkoutModal.addEventListener("click", (e) => {
            if (e.target === checkoutModal) {
                closeCheckoutModal();
            }
        });
    }
});

// ============================================================
// GLOBAL MODAL HELPERS
// ============================================================
function openRechargeModal(name, price) {
    const modal = document.getElementById("checkout-modal");
    const titleEl = document.getElementById("checkout-item-name");
    const priceEl = document.getElementById("checkout-item-price");
    const payBtn = document.getElementById("btn-pay-now");

    if (titleEl) titleEl.textContent = name;
    if (priceEl) priceEl.textContent = price;
    if (payBtn) payBtn.innerHTML = "<span>Confirm & Recharge Now</span>";

    if (modal) {
        modal.classList.add("is-active");
        modal.setAttribute("aria-hidden", "false");
    }
}

function openPlanModal(planName, planPrice) {
    const modal = document.getElementById("checkout-modal");
    const titleEl = document.getElementById("checkout-item-name");
    const priceEl = document.getElementById("checkout-item-price");
    const payBtn = document.getElementById("btn-pay-now");

    if (titleEl) titleEl.textContent = "Upgrade to " + planName;
    if (priceEl) priceEl.textContent = planPrice;
    if (payBtn) payBtn.innerHTML = "<span>Confirm Subscription</span>";

    if (modal) {
        modal.classList.add("is-active");
        modal.setAttribute("aria-hidden", "false");
    }
}

function closeCheckoutModal() {
    const modal = document.getElementById("checkout-modal");
    if (modal) {
        modal.classList.remove("is-active");
        modal.setAttribute("aria-hidden", "true");
    }
}

function processCheckout() {
    const payBtn = document.getElementById("btn-pay-now");
    const itemName = document.getElementById("checkout-item-name")?.textContent || "Resource";

    if (payBtn) {
        payBtn.disabled = true;
        payBtn.innerHTML = "<span>Authorizing with Gateway...</span>";
    }

    setTimeout(() => {
        if (payBtn) {
            payBtn.innerHTML = "<span>✓ Payment Verified!</span>";
        }

        setTimeout(() => {
            closeCheckoutModal();
            alert("Success! " + itemName + " has been activated in your Photona Studio account. Quotas updated.");
            if (payBtn) {
                payBtn.disabled = false;
                payBtn.innerHTML = "<span>Confirm & Pay Now</span>";
            }
        }, 800);
    }, 1200);
}

function scrollToSection(id) {
    const el = document.getElementById(id);
    if (el) {
        el.scrollIntoView({ behavior: "smooth" });
    }
}
