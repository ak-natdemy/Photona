/* ============================================================
   PHOTONA - LUXURY LANDING PAGE JAVASCRIPT
   Features:
   - Dynamic Hero 3-Slide Carousel with Auto-slide & Touch
   - Interactive Billing Switcher (Monthly / Annual with 20% discount)
   - Password Visibility Eye Toggle for Login Section
   - Mobile Responsive Menu Drawer
   - Sticky Navbar Scroll Observer
   - Interactive Contact Form with Instant Studio Concierge Feedback
   - Back to Top Smooth Scroller
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

    /* ============================================================
       1. HERO 3-SLIDE CAROUSEL
       ============================================================ */
    const slides = document.querySelectorAll('.slide');
    const indicatorDots = document.querySelectorAll('.indicator-dot');
    const prevBtn = document.getElementById('slider-prev-btn');
    const nextBtn = document.getElementById('slider-next-btn');
    const sliderContainer = document.querySelector('.hero-slider-section');

    let currentSlide = 0;
    const totalSlides = slides.length;
    let slideInterval = null;
    const SLIDE_DURATION = 5500; // 5.5 seconds per slide

    function showSlide(index) {
        if (index < 0) {
            currentSlide = totalSlides - 1;
        } else if (index >= totalSlides) {
            currentSlide = 0;
        } else {
            currentSlide = index;
        }

        slides.forEach((slide, i) => {
            if (i === currentSlide) {
                slide.classList.add('active');
            } else {
                slide.classList.remove('active');
            }
        });

        indicatorDots.forEach((dot, i) => {
            if (i === currentSlide) {
                dot.classList.add('active');
            } else {
                dot.classList.remove('active');
            }
        });
    }

    function nextSlide() {
        showSlide(currentSlide + 1);
    }

    function prevSlide() {
        showSlide(currentSlide - 1);
    }

    function startAutoSlide() {
        if (!slideInterval && totalSlides > 1) {
            slideInterval = setInterval(nextSlide, SLIDE_DURATION);
        }
    }

    function pauseAutoSlide() {
        if (slideInterval) {
            clearInterval(slideInterval);
            slideInterval = null;
        }
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            nextSlide();
            pauseAutoSlide();
            startAutoSlide();
        });
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            prevSlide();
            pauseAutoSlide();
            startAutoSlide();
        });
    }

    indicatorDots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            showSlide(index);
            pauseAutoSlide();
            startAutoSlide();
        });
    });

    if (sliderContainer) {
        sliderContainer.addEventListener('mouseenter', pauseAutoSlide);
        sliderContainer.addEventListener('mouseleave', startAutoSlide);

        // Touch Swipe Support
        let touchStartX = 0;
        let touchEndX = 0;

        sliderContainer.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        sliderContainer.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            if (touchStartX - touchEndX > 50) {
                nextSlide(); // swipe left
            } else if (touchEndX - touchStartX > 50) {
                prevSlide(); // swipe right
            }
        }, { passive: true });
    }

    // Start auto slide
    startAutoSlide();


    /* ============================================================
       2. BILLING TOGGLE (Monthly / Annual)
       ============================================================ */
    const billingToggle = document.getElementById('billing-toggle');
    const labelMonthly = document.getElementById('label-monthly');
    const labelAnnual = document.getElementById('label-annual');
    const priceVals = document.querySelectorAll('.plan-val');
    const annualNotes = document.querySelectorAll('.plan-billed-note');
    let isAnnual = false;

    if (billingToggle) {
        billingToggle.addEventListener('click', toggleBilling);
    }
    if (labelMonthly) {
        labelMonthly.addEventListener('click', () => {
            if (isAnnual) toggleBilling();
        });
    }
    if (labelAnnual) {
        labelAnnual.addEventListener('click', () => {
            if (!isAnnual) toggleBilling();
        });
    }

    function toggleBilling() {
        isAnnual = !isAnnual;
        billingToggle.setAttribute('aria-checked', isAnnual.toString());

        if (labelMonthly && labelAnnual) {
            labelMonthly.classList.toggle('active', !isAnnual);
            labelAnnual.classList.toggle('active', isAnnual);
        }

        priceVals.forEach(val => {
            const monthlyPrice = val.getAttribute('data-monthly');
            const annualPrice = val.getAttribute('data-annual');
            if (isAnnual && annualPrice) {
                val.textContent = annualPrice;
            } else if (monthlyPrice) {
                val.textContent = monthlyPrice;
            }
        });

        annualNotes.forEach(note => {
            const annualText = note.getAttribute('data-annual-text');
            if (isAnnual && annualText) {
                note.textContent = annualText;
            } else {
                note.textContent = 'Billed monthly, cancel anytime';
            }
        });
    }


    /* ============================================================
       3. PASSWORD VISIBILITY TOGGLE (Login Section)
       ============================================================ */
    const togglePasswordBtn = document.getElementById('landing-toggle-password');
    const passwordInput = document.getElementById('landing-password');

    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener('click', () => {
            const isPassword = passwordInput.getAttribute('type') === 'password';
            passwordInput.setAttribute('type', isPassword ? 'text' : 'password');

            const eyeShow = togglePasswordBtn.querySelector('.eye-show');
            const eyeHide = togglePasswordBtn.querySelector('.eye-hide');

            if (eyeShow && eyeHide) {
                eyeShow.style.display = isPassword ? 'none' : 'block';
                eyeHide.style.display = isPassword ? 'block' : 'none';
            }
        });
    }


    /* ============================================================
       4. NAVBAR SCROLL EFFECT & STICKY STATE
       ============================================================ */
    const navbar = document.querySelector('.navbar');
    const backToTopBtn = document.getElementById('back-to-top-btn');

    window.addEventListener('scroll', () => {
        const scrollPos = window.scrollY;

        if (navbar) {
            if (scrollPos > 50) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
        }

        if (backToTopBtn) {
            if (scrollPos > 400) {
                backToTopBtn.classList.add('show');
            } else {
                backToTopBtn.classList.remove('show');
            }
        }
    }, { passive: true });

    if (backToTopBtn) {
        backToTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }


    /* ============================================================
       5. MOBILE DRAWER NAVIGATION (Simple & Minimal Interaction)
       ============================================================ */
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileDrawer = document.getElementById('mobile-drawer');

    if (mobileMenuBtn && mobileDrawer) {
        mobileMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = mobileDrawer.classList.toggle('open');
            mobileMenuBtn.setAttribute('aria-expanded', isOpen.toString());
        });

        // Close when clicking a link inside mobile drawer
        mobileDrawer.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                mobileDrawer.classList.remove('open');
                mobileMenuBtn.setAttribute('aria-expanded', 'false');
            });
        });

        // Close when clicking anywhere outside
        document.addEventListener('click', (e) => {
            if (!mobileDrawer.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
                if (mobileDrawer.classList.contains('open')) {
                    mobileDrawer.classList.remove('open');
                    mobileMenuBtn.setAttribute('aria-expanded', 'false');
                }
            }
        });
    }


    /* ============================================================
       6. CONTACT FORM SUBMISSION
       ============================================================ */
    const contactForm = document.getElementById('landing-contact-form');
    const contactToast = document.getElementById('contact-toast');

    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const submitBtn = contactForm.querySelector('.btn-contact-submit');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<span>Sending Request...</span>';
            submitBtn.disabled = true;

            const formData = new FormData(contactForm);

            fetch('/contact-submit/', {
                method: 'POST',
                body: formData,
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            })
            .then(res => res.json())
            .then(data => {
                if (contactToast) {
                    contactToast.textContent = data.message || 'Thank you! Our studio concierge will contact you within 24 hours.';
                    contactToast.style.display = 'block';
                    contactToast.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
                contactForm.reset();
            })
            .catch(() => {
                if (contactToast) {
                    contactToast.textContent = 'Message sent! Our studio team will get back to you shortly.';
                    contactToast.style.display = 'block';
                }
                contactForm.reset();
            })
            .finally(() => {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            });
        });
    }


    /* ============================================================
       7. AUTO SCROLL TO LOGIN IF ERROR PRESENT
       ============================================================ */
    const loginErrorFlag = document.getElementById('login-error-flag');
    if (loginErrorFlag) {
        const loginSection = document.getElementById('login');
        if (loginSection) {
            setTimeout(() => {
                loginSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300);
        }
    }

});
