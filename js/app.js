/* ═══════════════════════════════════════════════════════
   YENG CONSTANTINO OFFICIAL — Core Application JS
   Shared utilities, auth, API helpers, navigation
   ═══════════════════════════════════════════════════════ */

const APP = {
    // In the browser this stays relative ('/.netlify/functions').
    // Inside the native app, native-bridge.js sets NativeBridge.API_BASE to
    // the full Netlify origin, so calls hit the live functions over HTTPS.
    API_BASE: ((window.NativeBridge && window.NativeBridge.API_BASE) || '') + '/.netlify/functions',
    TOKEN_KEY: 'yc_token',
    USER_KEY: 'yc_user',

    // True when this page is rendered inside demo.html's Web/App frame.
    // Pages use it to drop the intro animation and any chrome that only makes
    // sense standalone.
    // True when demo.html is rendering this page inside its iPhone bezel.
    // env(safe-area-inset-top) resolves to 0 in an iframe, so the site's nav
    // would sit under the Dynamic Island without this.
    isPhoneFrame: (function () {
        try { return new URLSearchParams(window.location.search).get('frame') === 'phone'; }
        catch (e) { return false; }
    })(),

    isEmbedded: (function () {
        try {
            return new URLSearchParams(window.location.search).get('embed') === '1'
                || window.self !== window.top;
        } catch (e) {
            return true; // cross-origin frame access threw — treat as embedded
        }
    })(),
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
        // A fresh session invalidates the login/signup loop guards.
        try {
            sessionStorage.removeItem('yc_login_bounced');
            sessionStorage.removeItem('yc_signup_bounced');
        } catch (e) { /* private mode */ }
        // Mirror into the shared App Group so home-screen widgets can fetch
        // on the fan's behalf. No-ops in the browser / when not native.
        if (window.NativeBridge && NativeBridge.syncWidgetData) {
            NativeBridge.syncWidgetData(user, token);
        }
    },

    clearSession() {
        localStorage.removeItem(APP.TOKEN_KEY);
        localStorage.removeItem(APP.USER_KEY);
        // Wipe the shared widget data so widgets fall back to their public state.
        if (window.NativeBridge && NativeBridge.clearWidgetData) {
            NativeBridge.clearWidgetData();
        }
    },

    /** Read a JWT's payload without verifying it.

        The signature can only be checked server-side, but `exp` is public and
        that is enough to know a token is spent. Returns null if the string is
        not a JWT at all. */
    decodeToken(token) {
        try {
            var part = String(token || '').split('.')[1];
            if (!part) return null;
            var b64 = part.replace(/-/g, '+').replace(/_/g, '/');
            while (b64.length % 4) b64 += '=';
            return JSON.parse(decodeURIComponent(escape(atob(b64))));
        } catch (e) {
            return null;
        }
    },

    /** True only if a token exists AND has not expired.

        This used to be `!!this.getToken()`, which meant the app called itself
        logged in for any leftover string. Once a token expired -- seven days,
        or a JWT_SECRET rotation -- every authenticated call 401'd while the
        nav still said "logged in", pages showed "Log in to play", and
        login.html bounced the fan straight back out because it asked this same
        question. There was no way out except finding Log Out by hand.

        Sixty seconds of leeway so a token does not die mid-request. */
    isLoggedIn() {
        var token = this.getToken();
        if (!token) return false;
        var payload = this.decodeToken(token);
        // A token we cannot parse might still be valid to the server; only
        // treat a *readable* and expired `exp` as proof it is dead.
        if (payload && typeof payload.exp === 'number') {
            if (Date.now() >= (payload.exp * 1000) - 60000) {
                this.clearSession();
                return false;
            }
        }
        return true;
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
    },

    /* ── Admin Helpers ── */
    getRole() {
        const user = this.getUser();
        return user ? user.role || 'User' : 'User';
    },

    isAdmin() {
        const role = this.getRole();
        return role === 'Admin' || role === 'SuperAdmin';
    },

    isSuperAdmin() {
        return this.getRole() === 'SuperAdmin';
    },

    getViewMode() {
        if (!this.isAdmin()) return 'user';
        return sessionStorage.getItem('yc_view_mode') || 'admin';
    },

    setViewMode(mode) {
        sessionStorage.setItem('yc_view_mode', mode);
        updateNavAuth();
    },

    isAdminView() {
        return this.isAdmin() && this.getViewMode() === 'admin';
    },

    getEffectiveTier() {
        if (this.isAdmin()) return 'Ikaw Lamang';
        return this.getUserTier();
    },

    requireAdmin(redirectTo) {
        if (!this.requireAuth(redirectTo)) return false;
        if (!this.isAdmin()) {
            window.location.href = '/';
            showToast('Access denied', 'error');
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
        /* The server is the authority on whether a token is good. If it says
           401 while we were sending one, that session is finished -- expired,
           signed with a rotated secret, or belonging to a deleted user. Drop
           it, so the UI stops claiming to be logged in and login.html will
           actually let the fan back in.

           Only when a token was actually sent: a 401 from a public page that
           never had a session is just an unauthenticated read. */
        if (res.status === 401 && token) {
            Auth.clearSession();
            window.dispatchEvent(new CustomEvent('authStateChanged', {
                detail: { loggedIn: false, user: null, reason: 'session-expired' },
            }));
        }
        throw new Error(data.error || 'Something went wrong');
    }

    return data;
}

/* ── Fan Score Activity Tracking ──
   Fire-and-forget signals into the ActivityEvents log. Points are assigned
   SERVER-SIDE in track-activity.js (the client can't award itself points),
   so these calls only name the signal + optional metadata. Silently no-ops
   for signed-out visitors and never blocks the UI on a failed request. */
const Activity = {
    track(type, metadata) {
        if (!Auth.isLoggedIn()) return;
        api('track-activity', {
            method: 'POST',
            body: { type: type, metadata: metadata || {} },
        }).catch(() => {});
    },

    // Once-per-day-per-page site visit. The server also enforces the daily
    // cap, but throttling here avoids pointless requests on every navigation.
    siteVisit() {
        if (!Auth.isLoggedIn()) return;
        var today = new Date().toISOString().slice(0, 10);
        var key = 'yc_visit_' + today;
        if (localStorage.getItem(key)) return;
        localStorage.setItem(key, '1');
        this.track('site_visit', { path: window.location.pathname });
    },
};
window.Activity = Activity;

/* ── YouTube thumbnail source ────────────────────────────────────────
   Lives here rather than in js/yeng.js because music.html and covers.html
   load app.js but not yeng.js, and they render thumbnails too.

   hqdefault.jpg is 480x360: a 4:3 canvas with 45px of black baked into the
   pixels above and below the 16:9 content — exactly 12.5% each side. Any
   crop of it keeps the bars, so the fix is CSS, not the URL (see .yt-crop
   in styles.css). maxresdefault has no bars but is only generated for
   uploads of 720p or better, and this catalogue is 2006-2016, so it 404s
   on most of it. mqdefault is bar-free but only 320x180.

   So: normalise to hqdefault and let .yt-crop remove the bars.
   ──────────────────────────────────────────────────────────────────── */
window.ytArt = function (url) {
    if (!url) return url;
    return String(url).replace(/\/(maxres|sd|mq|)default\.jpg/, '/hqdefault.jpg');
};

/* ── Art: the catalogue as pictures ──────────────────────────────────
   Every page that names one of her songs can now show the still from it.
   Before this, eight real thumbnails sat in the music catalogue and only
   music.html and the featured strip on the home page ever drew them —
   eight of fourteen fan pages rendered no picture at all.

   Resolution order, best available first (never a stock photo, never a
   gradient tile pretending to be one):
     1. an explicit image on the row
     2. the still from her recording of that song
     3. a ruled paper panel with the title in the hand face — honest,
        clearly not a photograph, and obviously part of the scrapbook
   ──────────────────────────────────────────────────────────────────── */
window.Art = (function () {
    var CACHE_KEY = 'yc_art_v1';
    var _map = null;          // normalised title -> { thumb, title, year }
    var _list = [];           // catalogue order, for the walls
    var _loading = null;

    function norm(s) {
        return String(s || '')
            .toLowerCase()
            .replace(/\(.*?\)|\[.*?\]/g, ' ')      // "Ikaw (Live)" -> "ikaw"
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    function ingest(items) {
        _map = {};
        _list = [];
        (items || []).forEach(function (it) {
            if (!it || !it.thumbnail) return;
            var row = { thumb: window.ytArt(it.thumbnail), title: it.title || '', year: it.year || null };
            _list.push(row);
            var k = norm(it.title);
            if (k && !_map[k]) _map[k] = row;
        });
        return _list;
    }

    /** Fetch the catalogue once per session. Never throws: a page that
        can't reach the API still renders its paper panels. */
    function load() {
        if (_map) return Promise.resolve(_list);
        if (_loading) return _loading;

        var cached = null;
        try { cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { /* ignore */ }
        if (cached && cached.length) { ingest(cached); return Promise.resolve(_list); }

        /* APP.API_BASE, not a bare '/api/...': inside the Capacitor app the
           pages are served from the bundle and the functions live on the
           Netlify origin, so a root-relative path resolves to nothing. */
        _loading = fetch(APP.API_BASE + '/get-music-content?limit=200')
            .then(function (r) { return r.ok ? r.json() : { content: [] }; })
            .then(function (d) {
                var items = (d.content || []).map(function (x) {
                    return { title: x.title, thumbnail: x.thumbnail, year: x.year };
                }).filter(function (x) { return x.thumbnail; });
                try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(items)); } catch (e) { /* quota */ }
                return ingest(items);
            })
            .catch(function () { return ingest([]); });
        return _loading;
    }

    /** The still from her recording of `title`, or null. */
    function forSong(title) {
        if (!_map) return null;
        var k = norm(title);
        if (!k) return null;
        if (_map[k]) return _map[k].thumb;
        // "Jeepney Love Story cover" / "my Hawak Kamay story" — the song
        // name is usually inside a longer fan-written string.
        var keys = Object.keys(_map);
        for (var i = 0; i < keys.length; i++) {
            if (keys[i].length >= 4 && k.indexOf(keys[i]) !== -1) return _map[keys[i]].thumb;
        }
        return null;
    }

    function all() { return _list.slice(); }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    /** One taped scrapbook photo. `src` wins; else the song still; else
        a ruled paper panel carrying the caption. */
    function tile(opts) {
        opts = opts || {};
        var src = opts.src || (opts.song ? forSong(opts.song) : null);
        var cap = opts.caption || opts.song || '';
        var cls = 'art-tile' + (opts.tilt === 'left' ? ' art-tile--left' : '') + (opts.className ? ' ' + opts.className : '');
        var inner = src
            ? '<span class="art-tile__plate yt-crop"><img src="' + esc(src) + '" alt="' + esc(opts.alt || cap) + '"'
                + ' loading="lazy" decoding="async"'
                + ' onerror="this.parentNode.setAttribute(\'data-failed\', this.alt || \'\')"></span>'
            : '<span class="art-tile__plate art-tile__plate--await"><span>' + esc(cap) + '</span></span>';
        return '<figure class="' + cls + '">' + inner
            + (opts.caption ? '<figcaption class="art-tile__cap">' + esc(opts.caption) + '</figcaption>' : '')
            + '</figure>';
    }

    /** Fill `el` with a wall of catalogue stills, repeating to `count`.
        Built from the data, so a new song lands on every wall at once. */
    function wall(el, count) {
        if (!el) return;
        return load().then(function (rows) {
            if (!rows.length) { el.setAttribute('data-empty', '1'); return; }
            var n = count || 24, out = [];
            for (var i = 0; i < n; i++) {
                var r = rows[i % rows.length];
                out.push('<img src="' + esc(r.thumb) + '" alt="" aria-hidden="true" loading="lazy" decoding="async"'
                    + ' onerror="this.setAttribute(\'data-failed\', \'1\')">');
            }
            el.innerHTML = out.join('');
        });
    }

    return { load: load, forSong: forSong, all: all, tile: tile, wall: wall, norm: norm };
})();

/* ── Reveal on scroll ────────────────────────────────────────────────
   `.animate-on-scroll` had an observer in this file and was on zero
   pages. This is the same idea under the class the pages actually use,
   unobserving after it fires so scrolling back up doesn't re-animate. */
window.initReveal = function (root) {
    var els = (root || document).querySelectorAll('.reveal:not(.is-in)');
    if (!els.length) return;
    if (!('IntersectionObserver' in window) ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        els.forEach(function (el) { el.classList.add('is-in'); });
        return;
    }
    var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
            if (!e.isIntersecting) return;
            e.target.classList.add('is-in');
            io.unobserve(e.target);
        });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    els.forEach(function (el) { io.observe(el); });
};

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
    const adminLinks = document.querySelectorAll('[data-admin]');
    const loggedIn = Auth.isLoggedIn();
    const isAdmin = Auth.isAdmin();
    const isAdminView = Auth.isAdminView();

    authLinks.forEach(el => el.style.display = loggedIn ? '' : 'none');
    guestLinks.forEach(el => el.style.display = loggedIn ? 'none' : '');
    adminLinks.forEach(el => el.style.display = (loggedIn && isAdmin) ? '' : 'none');

    if (loggedIn) {
        const user = Auth.getUser();
        document.querySelectorAll('[data-user-name]').forEach(el => {
            el.textContent = user?.name || 'Fan';
        });

        // Admin view toggle label
        const toggleLabel = document.getElementById('view-toggle-label');
        if (toggleLabel && isAdmin) {
            toggleLabel.textContent = isAdminView ? 'User View' : 'Admin View';
        }
    }
}

/* ── Admin View Toggle ── */
function toggleAdminView() {
    var current = Auth.getViewMode();
    var next = current === 'admin' ? 'user' : 'admin';
    Auth.setViewMode(next);
    if (next === 'admin') {
        showToast('Switched to Admin View', 'info');
    } else {
        showToast('Switched to User View (Ikaw Lamang)', 'info');
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
                // Hide the sibling that stands in while no photo is supplied.
                // .scrap-photo__await is the scrapbook mount's paper card —
                // there is no stock imagery in this build, so an unset key
                // shows a handwritten placeholder rather than a stranger's
                // concert photo.
                const sibling = el.parentElement && el.parentElement.querySelector(
                    '.about__image-text, .scrap-photo__await'
                );
                if (sibling) sibling.style.display = 'none';
            }
        });

        // Background images: <div data-config-bg="hero_photo">
        document.querySelectorAll('[data-config-bg]').forEach(el => {
            const key = el.dataset.configBg;
            const url = this.getImage(key);
            if (url) {
                el.style.background = `url(${url}) center/cover no-repeat`;
                el.textContent = '';
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

/* ── Page Loader (Signature Animation) ── */
function initPageLoader() {
    // Inside the six-view demo shell (demo.html) every panel is an iframe with
    // its own sessionStorage partition, so the 2.8s signature animation would
    // fire on every view switch. `?embed=1` suppresses it.
    if (APP.isEmbedded) return;

    // Skip if already shown this session (only show once per session)
    if (sessionStorage.getItem('yc_loader_shown')) {
        return;
    }
    sessionStorage.setItem('yc_loader_shown', '1');

    // Create loader HTML
    var loader = document.createElement('div');
    loader.className = 'page-loader';
    loader.id = 'page-loader';
    loader.innerHTML = '<svg class="page-loader__signature" viewBox="0 0 440 150" xmlns="http://www.w3.org/2000/svg">'
        // "Yeng" — large, bold cursive
        + '<path class="sig-line-1" style="--path-length:800" d="'
        // Y
        + 'M60,15 Q65,10 72,28 L90,65 Q95,75 88,85 Q80,95 68,100'
        + ' M110,10 Q105,15 95,45 L88,65'
        // e
        + ' M115,40 Q130,35 135,45 Q138,55 128,60 Q118,62 115,55 Q112,48 118,42'
        + ' Q125,60 140,55'
        // n
        + ' M145,38 L142,62 M145,45 Q152,35 160,40 Q165,45 162,62'
        // g
        + ' M172,38 Q182,35 188,42 Q192,50 185,58 Q178,62 172,58'
        + ' Q168,55 172,48 Q175,40 182,42'
        + ' M188,55 Q190,72 182,82 Q175,88 165,85'
        + '" />'
        // "Constantino" — smaller flowing script beneath
        + '<path class="sig-line-2" style="--path-length:1100" d="'
        // C
        + 'M115,98 Q105,88 108,80 Q112,72 122,72 Q130,73 132,78'
        // o
        + ' M138,78 Q145,72 150,78 Q153,85 147,88 Q140,90 138,84'
        // n
        + ' M155,75 L153,90 M155,80 Q160,73 166,76 Q170,80 168,90'
        // s
        + ' M175,77 Q180,73 184,76 Q186,80 180,82 Q175,84 178,87 Q182,90 186,87'
        // t
        + ' M192,68 L190,90 M186,76 L196,76'
        // a
        + ' M200,78 Q208,72 212,78 Q215,85 208,88 Q202,90 200,85 L212,88'
        // n
        + ' M218,75 L216,90 M218,80 Q223,73 228,76 Q232,80 230,90'
        // t
        + ' M236,68 L234,90 M230,76 L240,76'
        // i
        + ' M244,75 L243,90 M244,70 L244,71'
        // n
        + ' M250,75 L248,90 M250,80 Q255,73 260,76 Q264,80 262,90'
        // o
        + ' M270,78 Q277,72 282,78 Q285,85 278,88 Q272,90 270,84'
        + '" />'
        // Decorative underline flourish
        + '<path class="sig-underline" style="--path-length:400" d="'
        + 'M55,108 Q120,118 220,105 Q320,95 390,102 Q400,104 380,106'
        + '" />'
        + '</svg>'
        + '<div class="page-loader__tagline">OPM Icon</div>';

    document.body.prepend(loader);

    // Hide loader after signature animation completes
    setTimeout(function() {
        loader.classList.add('page-loader--hidden');
        // Remove from DOM after transition
        setTimeout(function() {
            loader.remove();
        }, 600);
    }, 2800);
}

/* ── Language Selector (Google Translate) ── */
var LANGUAGES = [
    { code: 'en', label: 'English', flag: 'EN' },
    { code: 'tl', label: 'Filipino', flag: 'TL' },
    { code: 'ceb', label: 'Cebuano', flag: 'CEB' },
    { code: 'ilo', label: 'Ilocano', flag: 'ILO' }
];

function initLanguageSelector() {
    // Inject Google Translate script (hidden — we control the UI)
    var gtScript = document.createElement('script');
    gtScript.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateInit';
    document.head.appendChild(gtScript);

    // Create our custom selector and inject into nav
    var navLinks = document.querySelector('.nav__links');
    if (!navLinks) return;

    var currentLang = localStorage.getItem('yc_lang') || 'en';
    var currentLabel = LANGUAGES.find(function(l) { return l.code === currentLang; });

    var li = document.createElement('li');
    li.className = 'lang-selector';
    li.innerHTML = '<button class="lang-selector__btn" onclick="toggleLangDropdown(event)">'
        + '<span id="lang-current-flag">' + (currentLabel ? currentLabel.flag : 'EN') + '</span>'
        + ' &#9662;</button>'
        + '<div class="lang-selector__dropdown" id="lang-dropdown">'
        + LANGUAGES.map(function(lang) {
            var active = lang.code === currentLang ? ' lang-selector__option--active' : '';
            return '<button class="lang-selector__option' + active + '" onclick="switchLanguage(\'' + lang.code + '\')">' + lang.flag + ' &nbsp; ' + lang.label + '</button>';
        }).join('')
        + '</div>';

    // Insert before the first li in nav
    navLinks.insertBefore(li, navLinks.firstChild);

    // Hide Google Translate's default widget
    var style = document.createElement('style');
    style.textContent = '.goog-te-banner-frame, .skiptranslate, #google_translate_element { display: none !important; } body { top: 0 !important; }';
    document.head.appendChild(style);

    // Create hidden Google Translate element
    var gtDiv = document.createElement('div');
    gtDiv.id = 'google_translate_element';
    gtDiv.style.display = 'none';
    document.body.appendChild(gtDiv);

    // Restore language on load
    if (currentLang && currentLang !== 'en') {
        setTimeout(function() { applyGoogleTranslate(currentLang); }, 1500);
    }
}

window.googleTranslateInit = function() {
    new google.translate.TranslateElement({
        pageLanguage: 'en',
        includedLanguages: 'en,tl,ceb,ilo',
        autoDisplay: false
    }, 'google_translate_element');
};

window.toggleLangDropdown = function(e) {
    e.stopPropagation();
    var dd = document.getElementById('lang-dropdown');
    dd.classList.toggle('lang-selector__dropdown--open');
    // Close on outside click
    setTimeout(function() {
        document.addEventListener('click', function handler() {
            dd.classList.remove('lang-selector__dropdown--open');
            document.removeEventListener('click', handler);
        });
    }, 10);
};

window.switchLanguage = function(langCode) {
    localStorage.setItem('yc_lang', langCode);
    document.getElementById('lang-current-flag').textContent = LANGUAGES.find(function(l) { return l.code === langCode; }).flag;

    // Update active state
    document.querySelectorAll('.lang-selector__option').forEach(function(btn) {
        btn.classList.remove('lang-selector__option--active');
    });
    event.target.classList.add('lang-selector__option--active');

    // Close dropdown
    document.getElementById('lang-dropdown').classList.remove('lang-selector__dropdown--open');

    if (langCode === 'en') {
        // Reset to English — remove Google Translate
        var frame = document.querySelector('.goog-te-banner-frame');
        if (frame) frame.remove();
        // Clear the Google Translate cookie
        document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.' + location.hostname;
        window.location.reload();
    } else {
        applyGoogleTranslate(langCode);
    }
};

function applyGoogleTranslate(langCode) {
    // Set the Google Translate cookie
    document.cookie = 'googtrans=/en/' + langCode + '; path=/';
    document.cookie = 'googtrans=/en/' + langCode + '; path=/; domain=.' + location.hostname;

    // Trigger Google Translate
    var select = document.querySelector('.goog-te-combo');
    if (select) {
        select.value = langCode;
        select.dispatchEvent(new Event('change'));
    } else {
        // GT not loaded yet, retry
        setTimeout(function() { applyGoogleTranslate(langCode); }, 500);
    }
}

/* ── Instagram Feed ── */
// Normalize any IG URL to a clean permalink
function normalizeIgUrl(url) {
    if (!url) return '';
    url = url.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    // Strip query params like ?img_index=1
    url = url.split('?')[0];
    if (!url.endsWith('/')) url += '/';
    return url;
}

function initInstagramFeed() {
    const grid = document.getElementById('ig-feed-grid');
    if (!grid) return;

    SiteConfig.load().then(() => {
        const posts = [];
        for (let i = 1; i <= 9; i++) {
            const url = SiteConfig.get('ig_post_' + i);
            if (url && url.trim()) {
                posts.push(normalizeIgUrl(url));
            }
        }
        if (posts.length > 0) {
            renderIgEmbeds(grid, posts);
        } else {
            renderIgPlaceholder(grid);
        }
    });
}

function renderIgEmbeds(grid, postUrls) {
    // Use Instagram's official blockquote embed
    grid.innerHTML = postUrls.map(url =>
        '<blockquote class="instagram-media ig-feed__embed" ' +
            'data-instgrm-permalink="' + url + '" ' +
            'data-instgrm-version="14" ' +
            'style="max-width:100%;min-width:0;width:100%;margin:0;padding:0;">' +
        '</blockquote>'
    ).join('');

    // Load or re-process Instagram embed.js
    if (!document.getElementById('ig-embed-script')) {
        var script = document.createElement('script');
        script.id = 'ig-embed-script';
        script.async = true;
        script.src = '//www.instagram.com/embed.js';
        document.body.appendChild(script);
    } else if (window.instgrm) {
        window.instgrm.Embeds.process();
    }
}

/* When no Instagram posts are configured, this used to paint nine tiles of
   Instagram's OWN brand gradient (#833AB4 → #FD1D1D) with a music-note glyph
   in each — another company's colours, standing in for photographs, in a
   624px section that rendered zero images. It now falls back to her stills,
   which are real and already loaded. If even those are unreachable the
   section removes itself rather than showing a grid of coloured squares. */
function renderIgPlaceholder(grid) {
    Art.load().then(function (rows) {
        var section = grid.closest('.ig-feed');
        if (!rows.length) { if (section) section.hidden = true; return; }
        var n = 9, out = [];
        for (var i = 0; i < n; i++) {
            var r = rows[i % rows.length];
            out.push('<a href="https://www.instagram.com/yeng/" target="_blank" rel="noopener"'
                + ' class="ig-feed__item ig-feed__item--art yt-crop" title="' + r.title.replace(/"/g, '&quot;') + '">'
                + '<img src="' + r.thumb + '" alt="' + r.title.replace(/"/g, '&quot;') + '" loading="lazy" decoding="async"></a>');
        }
        grid.innerHTML = out.join('');
    });
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
    if (APP.isEmbedded) document.documentElement.classList.add('is-embedded');
    if (APP.isPhoneFrame) document.documentElement.classList.add('is-phone-frame');
    initPageLoader();
    initNav();
    initLanguageSelector();
    initScrollAnimations();
    initReveal();
    initInstagramFeed();

    // Any page can put her catalogue behind its hero with one attribute:
    //   <div class="artwall"><div class="artwall__grid" data-artwall="24"></div></div>
    document.querySelectorAll('[data-artwall]').forEach(function (el) {
        Art.wall(el, parseInt(el.getAttribute('data-artwall'), 10) || 24);
    });

    // Load site config from Airtable and apply to page
    SiteConfig.load().then(() => {
        SiteConfig.applyToPage();
    });

    // Re-mirror the session into the shared App Group on every launch.
    // setSession() only runs at the moment of login; an already-logged-in
    // fan restores their session straight from localStorage and never calls
    // it again, so without this the widgets would think they're signed out.
    if (window.NativeBridge && NativeBridge.syncWidgetData && Auth.isLoggedIn()) {
        NativeBridge.syncWidgetData(Auth.getUser(), Auth.getToken());
    }

    // Log a daily site visit toward the fan's engagement score.
    Activity.siteVisit();

});
