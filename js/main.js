/**
 * Quips Marketing Website
 * Main JavaScript - Theme toggle, smooth scroll, animations
 */

(function() {
    'use strict';

    // ===== Theme Management =====
    const THEME_KEY = 'quips-theme';
    const DARK_CLASS = 'dark-theme';
    const LIGHT_CLASS = 'light-theme';

    // Get system preference
    function getSystemTheme() {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    // Get stored theme or null if not set (localStorage can throw when
    // storage is blocked, e.g. some private-browsing modes)
    function getStoredTheme() {
        try {
            return localStorage.getItem(THEME_KEY);
        } catch (e) {
            return null;
        }
    }

    // Apply theme to document
    function applyTheme(theme) {
        const body = document.body;
        if (theme === 'dark') {
            body.classList.remove(LIGHT_CLASS);
            body.classList.add(DARK_CLASS);
        } else {
            body.classList.remove(DARK_CLASS);
            body.classList.add(LIGHT_CLASS);
        }
    }

    // Get current active theme
    function getCurrentTheme() {
        return document.body.classList.contains(DARK_CLASS) ? 'dark' : 'light';
    }

    // Initialize theme on page load
    function initTheme() {
        const storedTheme = getStoredTheme();
        // Use stored preference if exists, otherwise use system preference
        const theme = storedTheme || getSystemTheme();
        applyTheme(theme);
    }

    // Apply a specific theme and remember the preference
    function setTheme(theme) {
        applyTheme(theme);
        try {
            localStorage.setItem(THEME_KEY, theme);
        } catch (e) { /* storage blocked — theme still applies this page */ }
    }

    // Toggle theme and save preference
    function toggleTheme() {
        const currentTheme = getCurrentTheme();
        setTheme(currentTheme === 'dark' ? 'light' : 'dark');
    }

    // Listen for system theme changes (only applies if user hasn't set manual preference)
    function watchSystemTheme() {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        mediaQuery.addEventListener('change', (e) => {
            // Only auto-switch if user hasn't set a manual preference
            if (!getStoredTheme()) {
                applyTheme(e.matches ? 'dark' : 'light');
            }
        });
    }

    // ===== Smooth Scroll =====
    function initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function(e) {
                const href = this.getAttribute('href');
                if (href === '#') return; // Skip placeholder links

                const target = document.querySelector(href);
                if (target) {
                    e.preventDefault();
                    const headerOffset = 80;
                    const elementPosition = target.getBoundingClientRect().top;
                    const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

                    window.scrollTo({
                        top: offsetPosition,
                        behavior: 'smooth'
                    });
                }
            });
        });
    }

    // ===== Scroll Animations =====
    function initScrollAnimations() {
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('fade-in-up');
                    observer.unobserve(entry.target);
                }
            });
        }, observerOptions);

        // Observe feature cards
        document.querySelectorAll('.feature-card').forEach((card, index) => {
            card.style.opacity = '0';
            card.style.animationDelay = `${index * 0.1}s`;
            observer.observe(card);
        });

        // Observe screenshot wrappers
        document.querySelectorAll('.screenshot-wrapper').forEach((wrapper, index) => {
            wrapper.style.opacity = '0';
            wrapper.style.animationDelay = `${index * 0.15}s`;
            observer.observe(wrapper);
        });
    }

    // ===== Screenshot Gallery (manifest-driven) =====
    // Builds the "See it in action" gallery from images/screenshots.json so
    // adding/removing a screen is a data change, not an HTML edit. Each entry
    // renders a light + dark image pair (toggled by the active theme via CSS),
    // and entries are grouped into one tab per platform (iPhone / iPad / Mac).
    async function initScreenshotGallery() {
        const container = document.getElementById('screenshots-gallery');
        if (!container) return;

        const manifestUrl = container.dataset.manifest || 'images/screenshots.json';

        let manifest;
        try {
            const response = await fetch(manifestUrl);
            manifest = await response.json();
        } catch (error) {
            console.error('Error loading screenshots manifest:', error);
            return; // Leave the <noscript> fallback in place.
        }

        const screens = (manifest && manifest.gallery) || [];
        if (!screens.length) return;

        // Platform order comes from the manifest, not from the order screens
        // happen to appear in — the tabs should read iPhone, iPad, Mac even if
        // a screen is appended out of order. A manifest with no "platforms"
        // (the pre-2.0 shape) is a single unlabelled iPhone group, which
        // renders exactly as the gallery did before tabs existed.
        const platforms = (manifest.platforms || []).filter(
            platform => screens.some(screen => platformOf(screen) === platform.id)
        );
        const groups = platforms.length
            ? platforms.map(platform => ({ ...platform, screens: screens.filter(s => platformOf(s) === platform.id) }))
            : [{ id: 'iphone', label: '', screens }];

        // Clear the no-JS fallback now that we can render the real gallery.
        container.innerHTML = '';

        // Reveal-on-scroll for the wrappers we create (mirrors initScrollAnimations).
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('fade-in-up');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

        const tablist = document.createElement('div');
        tablist.className = 'screenshots-tabs';
        tablist.setAttribute('role', 'tablist');
        tablist.setAttribute('aria-label', 'Screenshot platform');

        const tabs = [];
        const panels = [];

        groups.forEach((group, groupIndex) => {
            const panel = document.createElement('div');
            panel.className = 'screenshots-row';
            panel.id = `screenshots-panel-${group.id}`;
            panel.setAttribute('role', 'tabpanel');
            panel.setAttribute('aria-label', group.label || 'Screenshots');
            panel.hidden = groupIndex !== 0;

            group.screens.forEach((screen, index) => {
                const wrapper = document.createElement('div');
                wrapper.className = 'screenshot-wrapper';
                wrapper.style.opacity = '0';
                wrapper.style.animationDelay = `${index * 0.15}s`;

                const lightImg = makeGalleryImage(screen, 'light', group);
                const darkImg = makeGalleryImage(screen, 'dark', group);

                // If a screenshot hasn't been generated yet, hide the whole slot
                // so the live site never shows a broken-image icon — and if that
                // empties a platform, drop its tab too rather than offering one
                // that opens onto nothing.
                const onError = () => {
                    wrapper.remove();
                    if (!panel.querySelector('.screenshot-wrapper')) removeGroup(group.id);
                };
                lightImg.addEventListener('error', onError);
                darkImg.addEventListener('error', onError);

                const label = document.createElement('span');
                label.className = 'screenshot-label';
                label.textContent = screen.label || '';

                wrapper.append(lightImg, darkImg, label);
                panel.appendChild(wrapper);
                observer.observe(wrapper);
            });

            panels.push(panel);

            if (!group.label) return;   // single unlabelled group: no tab to draw

            const tab = document.createElement('button');
            tab.type = 'button';
            tab.className = 'screenshots-tab';
            tab.textContent = group.label;
            tab.id = `screenshots-tab-${group.id}`;
            tab.dataset.platform = group.id;
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-controls', panel.id);
            tab.setAttribute('aria-selected', String(groupIndex === 0));
            // Roving tabindex: only the selected tab is in the tab order, and
            // the arrow keys move between them (the ARIA tabs pattern).
            tab.tabIndex = groupIndex === 0 ? 0 : -1;
            tab.addEventListener('click', () => selectTab(group.id));
            tab.addEventListener('keydown', onTabKeydown);
            panel.setAttribute('aria-labelledby', tab.id);
            tabs.push(tab);
            tablist.appendChild(tab);
        });

        function selectTab(platformId, { focus = false } = {}) {
            tabs.forEach(tab => {
                const selected = tab.dataset.platform === platformId;
                tab.setAttribute('aria-selected', String(selected));
                tab.tabIndex = selected ? 0 : -1;
                if (selected && focus) tab.focus();
            });
            panels.forEach(panel => {
                panel.hidden = panel.id !== `screenshots-panel-${platformId}`;
                // A hidden panel keeps whatever the reader scrolled it to; the
                // row is centered when it fits, so reset it to the start rather
                // than reopening mid-row.
                if (!panel.hidden) panel.scrollLeft = 0;
            });
        }

        function onTabKeydown(event) {
            const visible = tabs.filter(tab => !tab.hidden);
            const step = { ArrowRight: 1, ArrowLeft: -1, Home: -Infinity, End: Infinity }[event.key];
            if (step === undefined) return;
            event.preventDefault();
            const current = visible.indexOf(event.currentTarget);
            let next;
            if (step === -Infinity) next = 0;
            else if (step === Infinity) next = visible.length - 1;
            else next = (current + step + visible.length) % visible.length;
            selectTab(visible[next].dataset.platform, { focus: true });
        }

        function removeGroup(platformId) {
            const tab = tabs.find(t => t.dataset.platform === platformId);
            const panel = panels.find(p => p.id === `screenshots-panel-${platformId}`);
            if (panel) panel.remove();
            if (!tab) return;
            const wasSelected = tab.getAttribute('aria-selected') === 'true';
            tab.hidden = true;
            const remaining = tabs.filter(t => !t.hidden);
            // One platform left is not a choice; drop the tab strip entirely.
            if (remaining.length <= 1) tablist.hidden = true;
            if (wasSelected && remaining.length) selectTab(remaining[0].dataset.platform);
        }

        if (tabs.length > 1) container.appendChild(tablist);
        panels.forEach(panel => container.appendChild(panel));
    }

    // Entries predating the multi-platform manifest carry no "platform"; they
    // were all iPhone, so that is what an absent field means.
    function platformOf(screen) {
        return screen.platform || 'iphone';
    }

    function makeGalleryImage(screen, mode, group) {
        const img = document.createElement('img');
        img.src = `images/${screen[mode]}`;
        img.alt = screen.alt || screen.label || 'Quips screenshot';
        img.loading = 'lazy';
        img.className = `gallery-screenshot screenshot-${mode} is-${group.id}`;
        // A pose that is not the platform's usual shape (the Duo's closed and
        // half-open shots) names a variant, which the stylesheet sizes separately.
        if (screen.variant) img.classList.add(`is-${group.id}-${screen.variant}`);
        // Framed shots carry their own bezel and shadow in the PNG; unframed
        // ones (iPad, Mac) get the rounded corner and shadow from CSS, which
        // would double up if applied to a bezel. Framing is the default —
        // every screenshot was framed before the manifest could say otherwise.
        if (group.frame === false) img.classList.add('is-unframed');
        return img;
    }

    // ===== Header Scroll Effect =====
    function initHeaderScroll() {
        const header = document.querySelector('.header');
        let lastScroll = 0;

        window.addEventListener('scroll', () => {
            const currentScroll = window.pageYOffset;

            if (currentScroll > 50) {
                header.style.boxShadow = 'var(--shadow-md)';
            } else {
                header.style.boxShadow = 'none';
            }

            lastScroll = currentScroll;
        });
    }

    // ===== Navigation Menu =====
    function initNavMenu() {
        const menuToggle = document.getElementById('menuToggle');
        const navDropdown = document.getElementById('navDropdown');

        if (!menuToggle || !navDropdown) return;

        // Toggle menu on button click
        menuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = menuToggle.classList.contains('open');
            menuToggle.classList.toggle('open');
            navDropdown.classList.toggle('open');
            menuToggle.setAttribute('aria-expanded', !isOpen);
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!menuToggle.contains(e.target) && !navDropdown.contains(e.target)) {
                menuToggle.classList.remove('open');
                navDropdown.classList.remove('open');
                menuToggle.setAttribute('aria-expanded', 'false');
            }
        });

        // Close menu on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && menuToggle.classList.contains('open')) {
                menuToggle.classList.remove('open');
                navDropdown.classList.remove('open');
                menuToggle.setAttribute('aria-expanded', 'false');
            }
        });
    }

    // ===== Copyright Year =====
    function updateCopyrightYear() {
        const yearSpan = document.getElementById('copyright-year');
        if (yearSpan) {
            yearSpan.textContent = new Date().getFullYear();
        }
    }

    // ===== Newsletter Form =====
    function initNewsletter() {
        const form = document.querySelector('.newsletter-form');
        const submitBtn = document.querySelector('.newsletter-submit');
        const loadingBtn = document.querySelector('.newsletter-loading');
        const body = document.querySelector('.newsletter-body');
        const success = document.querySelector('.newsletter-success');

        if (!form) return;

        form.addEventListener('submit', async function(e) {
            e.preventDefault();

            if (submitBtn && loadingBtn) {
                submitBtn.style.display = 'none';
                loadingBtn.style.display = 'inline-flex';
            }

            try {
                const formData = new FormData(form);
                await fetch(form.action, {
                    method: 'POST',
                    body: formData,
                    mode: 'no-cors'
                });

                // Show success state
                if (body && success) {
                    body.style.display = 'none';
                    success.style.display = 'block';
                }
            } catch (error) {
                // Reset button state on error
                if (submitBtn && loadingBtn) {
                    submitBtn.style.display = 'inline-flex';
                    loadingBtn.style.display = 'none';
                }
            }
        });
    }

    // ===== Course Signup Form =====
    function initCourseForm() {
        const forms = document.querySelectorAll('.course-signup-form');
        const heroSection = document.querySelector('.course-hero');
        const successSection = document.querySelector('.course-success');
        const otherSections = document.querySelectorAll('.course-section');

        if (!forms.length) return;

        forms.forEach(form => {
            const submitBtn = form.querySelector('.course-submit-btn');
            const loadingBtn = form.querySelector('.course-loading-btn');

            form.addEventListener('submit', async function(e) {
                e.preventDefault();

                if (submitBtn && loadingBtn) {
                    submitBtn.style.display = 'none';
                    loadingBtn.style.display = 'inline-flex';
                }

                try {
                    const formData = new FormData(form);
                    await fetch(form.action, {
                        method: 'POST',
                        body: formData,
                        mode: 'no-cors'
                    });

                    // Show success state
                    if (heroSection && successSection) {
                        heroSection.style.display = 'none';
                        successSection.style.display = 'block';
                        otherSections.forEach(section => section.style.display = 'none');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                } catch (error) {
                    // Reset button state on error
                    if (submitBtn && loadingBtn) {
                        submitBtn.style.display = 'inline-flex';
                        loadingBtn.style.display = 'none';
                    }
                }
            });
        });
    }

    // ===== Homepage FAQ Accordion =====
    // Accessible accordion for the static FAQ list on index.html. Each
    // question is a <button aria-expanded aria-controls> paired with a
    // hidden answer panel. One panel open at a time.
    function initHomeFaq() {
        const toggles = document.querySelectorAll('.faq .faq-toggle');
        if (!toggles.length) return;

        toggles.forEach(toggle => {
            toggle.addEventListener('click', () => {
                const expanded = toggle.getAttribute('aria-expanded') === 'true';

                // Close any other open panel first (one open at a time).
                toggles.forEach(other => {
                    if (other === toggle) return;
                    other.setAttribute('aria-expanded', 'false');
                    const otherPanel = document.getElementById(other.getAttribute('aria-controls'));
                    if (otherPanel) otherPanel.hidden = true;
                });

                toggle.setAttribute('aria-expanded', String(!expanded));
                const panel = document.getElementById(toggle.getAttribute('aria-controls'));
                if (panel) panel.hidden = expanded;
            });
        });
    }

    // ===== App Store Deep Link (collection CTAs) =====
    // Post-launch, collection page App Store badges carry a
    // data-collection-id and try the native `quips://public-collection/<id>`
    // deep link first (for users who already have the app installed),
    // falling back to the badge's normal /go/appstore.html href if the app
    // doesn't open within DEEP_LINK_TIMEOUT_MS. Detection: if opening the
    // scheme backgrounds the tab (visibilitychange/pagehide fires) before the
    // timeout, the app handled it and the fallback navigation is skipped.
    // No-op today — badges only get data-collection-id once the TODO(launch)
    // comment around them is uncommented in scripts/build-collections.mjs.
    const DEEP_LINK_TIMEOUT_MS = 1500;

    function openInQuips(link) {
        const collectionId = link.dataset.collectionId;
        const fallbackUrl = link.getAttribute('href');
        if (!collectionId || !fallbackUrl) return;

        let appOpened = false;
        const markOpened = () => {
            if (document.hidden) appOpened = true;
        };
        document.addEventListener('visibilitychange', markOpened);
        window.addEventListener('pagehide', markOpened);

        window.location.href = `quips://public-collection/${encodeURIComponent(collectionId)}`;

        setTimeout(() => {
            document.removeEventListener('visibilitychange', markOpened);
            window.removeEventListener('pagehide', markOpened);
            if (!appOpened) {
                window.location.href = fallbackUrl;
            }
        }, DEEP_LINK_TIMEOUT_MS);
    }

    function initDeepLinkBadges() {
        document.querySelectorAll('.app-store-badge[data-collection-id]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                openInQuips(link);
            });
        });
    }

    // ===== Initialize =====
    function init() {
        // Theme
        initTheme();
        watchSystemTheme();

        // Theme toggle button
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', toggleTheme);
        }

        // Inline theme links (e.g. "light mode" / "dark mode" in copy)
        document.querySelectorAll('.theme-inline-link').forEach(link => {
            link.addEventListener('click', () => setTheme(link.dataset.theme));
        });

        // Other features
        initNavMenu();
        initSmoothScroll();
        initScreenshotGallery();
        initScrollAnimations();
        initHeaderScroll();
        updateCopyrightYear();
        initNewsletter();
        initCourseForm();
        initHomeFaq();
        initDeepLinkBadges();
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
