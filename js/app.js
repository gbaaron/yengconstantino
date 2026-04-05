/* ═══════════════════════════════════════════════════════
   YENG CONSTANTINO OFFICIAL — Core Application JS
   Shared utilities, auth, API helpers, navigation
   ═══════════════════════════════════════════════════════ */

const APP = {
    API_BASE: '/.netlify/functions',
    TOKEN_KEY: 'yc_token',
    USER_KEY: 'yc_user',
};

/* ── Auth Helpers ── */
const Auth = {
    getToken() {
        return localStorage.getItem(APP.TOKEN_KEY);
    },

    getUser() {
        const data = localStorage.getItem(APP.USER_KEY);
        return data ? JSON.parse(data) : null;
    },

    setSession(token, user) {
        localStorage.setItem(APP.TOKEN_KEY, token);
        localStorage.setItem(APP.USER_KEY, JSON.stringify(user));
    },

    clearSession() {
        localStorage.removeItem(APP.TOKEN_KEY);
        localStorage.removeItem(APP.USER_KEY);
    },

    isLoggedIn() {
        return !!this.getToken();
    },

    getUserTier() {
        const user = this.getUser();
        return user ? user.membershipTier || 'Free' : 'Free';
    },

    requireAuth(redirectTo) {
        if (!this.isLoggedIn()) {
            window.location.href = `/login.html?redirect=${encodeURIComponent(redirectTo || window.location.pathname)}`;
            return false;
        }
        return true;
    }
};

/* ── API Helper ── */
async function api(endpoint, options = {}) {
    const token = Auth.getToken();
    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...options.headers,
        },
        ...options,
    };

    if (config.body && typeof config.body === 'object') {
        config.body = JSON.stringify(config.body);
    }

    const res = await fetch(`${APP.API_BASE}/${endpoint}`, config);
    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.error || 'Something went wrong');
    }

    return data;
}

/* ── Toast Notifications ── */
function showToast(message, type = 'info', duration = 3500) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('toast--visible');
    });

    setTimeout(() => {
        toast.classList.remove('toast--visible');
        setTimeout(() => toast.remove(), 400);
    }, duration);
}

/* ── Navigation ── */
function initNav() {
    const nav = document.querySelector('.nav');
    const toggle = document.querySelector('.nav__toggle');
    const links = document.querySelector('.nav__links');

    // Scroll effect
    if (nav) {
        window.addEventListener('scroll', () => {
            nav.classList.toggle('nav--scrolled', window.scrollY > 20);
        });
    }

    // Mobile toggle
    if (toggle && links) {
        toggle.addEventListener('click', () => {
            links.classList.toggle('nav__links--open');
            toggle.setAttribute('aria-expanded', links.classList.contains('nav__links--open'));
        });

        // Close on link click
        links.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                links.classList.remove('nav__links--open');
            });
        });
    }

    // Update auth state in nav
    updateNavAuth();
}

function updateNavAuth() {
    const authLinks = document.querySelectorAll('[data-auth]');
    const guestLinks = document.querySelectorAll('[data-guest]');
    const loggedIn = Auth.isLoggedIn();

    authLinks.forEach(el => el.style.display = loggedIn ? '' : 'none');
    guestLinks.forEach(el => el.style.display = loggedIn ? 'none' : '');

    // Set username
    if (loggedIn) {
        const user = Auth.getUser();
        document.querySelectorAll('[data-user-name]').forEach(el => {
            el.textContent = user?.name || 'Fan';
        });
    }
}

/* ── Countdown Timer ── */
function initCountdown(elementId, targetDate) {
    const el = document.getElementById(elementId);
    if (!el) return;

    function update() {
        const now = new Date().getTime();
        const target = new Date(targetDate).getTime();
        const diff = target - now;

        if (diff <= 0) {
            el.innerHTML = '<span class="badge badge--purple" style="font-size:1rem;padding:8px 24px;">LIVE NOW!</span>';
            return;
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        el.innerHTML = `
            <div class="countdown__unit">
                <div class="countdown__number">${days}</div>
                <div class="countdown__label">Days</div>
            </div>
            <div class="countdown__unit">
                <div class="countdown__number">${hours}</div>
                <div class="countdown__label">Hours</div>
            </div>
            <div class="countdown__unit">
                <div class="countdown__number">${minutes}</div>
                <div class="countdown__label">Mins</div>
            </div>
            <div class="countdown__unit">
                <div class="countdown__number">${seconds}</div>
                <div class="countdown__label">Secs</div>
            </div>
        `;

        requestAnimationFrame(() => setTimeout(update, 1000));
    }

    update();
}

/* ── Skeleton Loading ── */
function createSkeletonCards(count, container) {
    const el = document.querySelector(container);
    if (!el) return;

    el.innerHTML = Array(count).fill(`
        <div class="card">
            <div class="skeleton" style="height:200px;"></div>
            <div class="card__body">
                <div class="skeleton" style="height:14px;width:60%;margin-bottom:8px;"></div>
                <div class="skeleton" style="height:20px;width:90%;margin-bottom:8px;"></div>
                <div class="skeleton" style="height:14px;width:40%;"></div>
            </div>
        </div>
    `).join('');
}

/* ── Utility ── */
function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function formatPrice(amount) {
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 0,
    }).format(amount);
}

function truncate(str, len = 100) {
    if (!str || str.length <= len) return str;
    return str.substring(0, len).trim() + '...';
}

function debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

function generateOrderNumber() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'YC-';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/* ── Site Config (loads from Airtable SiteConfig table) ── */
const SiteConfig = {
    _cache: null,
    _loading: null,

    async load() {
        if (this._cache) return this._cache;
        if (this._loading) return this._loading;

        this._loading = fetch(`${APP.API_BASE}/get-site-config`)
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(data => {
                this._cache = data.config || {};
                this._loading = null;
                return this._cache;
            })
            .catch(() => {
                this._cache = {};
                this._loading = null;
                return {};
            });

        return this._loading;
    },

    get(key, fallback) {
        if (!this._cache) return fallback || '';
        const item = this._cache[key];
        return item ? (item.value || fallback || '') : (fallback || '');
    },

    getImage(key, fallback) {
        if (!this._cache) return fallback || '';
        const item = this._cache[key];
        return item ? (item.imageURL || fallback || '') : (fallback || '');
    },

    // Apply config values to elements with data-config attributes
    applyToPage() {
        if (!this._cache) return;

        // Text content: <span data-config="hero_title">fallback</span>
        document.querySelectorAll('[data-config]').forEach(el => {
            const key = el.dataset.config;
            const val = this.get(key);
            if (val) el.textContent = val;
        });

        // Images: <img data-config-img="hero_photo">
        document.querySelectorAll('[data-config-img]').forEach(el => {
            const key = el.dataset.configImg;
            const url = this.getImage(key);
            if (url) {
                el.src = url;
                el.style.display = '';
            }
        });

        // Background images: <div data-config-bg="hero_photo">
        document.querySelectorAll('[data-config-bg]').forEach(el => {
            const key = el.dataset.configBg;
            const url = this.getImage(key);
            if (url) {
                el.style.backgroundImage = `url(${url})`;
            }
        });

        // Social links: <a data-config-href="social_youtube">
        document.querySelectorAll('[data-config-href]').forEach(el => {
            const key = el.dataset.configHref;
            const val = this.get(key);
            if (val) el.href = val;
        });
    }
};

/* ── Scroll Animations ── */
function initScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.animate-on-scroll').forEach(el => {
        observer.observe(el);
    });
}

/* ── Instagram Feed ── */
function initInstagramFeed() {
    const grid = document.getElementById('ig-feed-grid');
    if (!grid) return;

    // Load IG posts from Airtable SiteConfig
    // In Airtable: create rows with keys "ig_post_1" through "ig_post_9"
    // Set the "value" field to the Instagram post URL (e.g. https://www.instagram.com/p/ABC123/)
    // Attach the photo in the "image" attachment field
    SiteConfig.load().then(() => {
        const posts = [];
        for (let i = 1; i <= 9; i++) {
            const img = SiteConfig.getImage('ig_post_' + i);
            const url = SiteConfig.get('ig_post_' + i);
            if (img) {
                posts.push({ img: img, url: url || 'https://www.instagram.com/yeng/' });
            }
        }
        if (posts.length > 0) {
            renderIgGrid(grid, posts);
        } else {
            renderIgPlaceholder(grid);
        }
    });
}

function renderIgGrid(grid, posts) {
    grid.innerHTML = posts.map(p => {
        const img = p.img || p.imageUrl || p.thumbnail || '';
        const url = p.url || p.permalink || 'https://www.instagram.com/yeng/';
        return '<a href="' + url + '" target="_blank" rel="noopener" class="ig-feed__item">' +
            '<img src="' + img + '" alt="Yeng Constantino Instagram post" loading="lazy">' +
            '</a>';
    }).join('');
}

function renderIgPlaceholder(grid) {
    // Show gradient placeholders that link to IG profile
    const colors = [
        'linear-gradient(135deg, #833AB4, #FD1D1D)',
        'linear-gradient(135deg, #FD1D1D, #F77737)',
        'linear-gradient(135deg, #F77737, #FCAF45)',
        'linear-gradient(135deg, #FCAF45, #833AB4)',
        'linear-gradient(135deg, #833AB4, #C13584)',
        'linear-gradient(135deg, #C13584, #FD1D1D)',
        'linear-gradient(135deg, #E1306C, #833AB4)',
        'linear-gradient(135deg, #F77737, #833AB4)',
        'linear-gradient(135deg, #FCAF45, #E1306C)'
    ];
    grid.innerHTML = colors.map((bg, i) =>
        '<a href="https://www.instagram.com/yeng/" target="_blank" rel="noopener" class="ig-feed__item" style="background:' + bg + '">' +
            '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,0.3);font-size:2rem;">&#9835;</div>' +
        '</a>'
    ).join('');
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
    initNav();
    initScrollAnimations();
    initInstagramFeed();

    // Load site config from Airtable and apply to page
    SiteConfig.load().then(() => {
        SiteConfig.applyToPage();
    });
});
