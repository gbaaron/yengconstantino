/* ═══════════════════════════════════════════════════════
   YENG — shared helpers for the new surfaces
   Loaded after js/app.js. Depends on Auth, api(), showToast().
   ═══════════════════════════════════════════════════════ */

(function (global) {
    'use strict';

    /* ── i18n ────────────────────────────────────────────
       Authored catalogue from /api/get-translations, cached per session.
       Falls back to the English string, never to machine translation.      */
    var I18N = {
        _strings: null,
        _lang: localStorage.getItem('yc_lang') || 'en',

        lang: function () { return this._lang; },

        async load(lang) {
            this._lang = lang || this._lang;
            var cacheKey = 'yc_i18n_' + this._lang;
            var cached = sessionStorage.getItem(cacheKey);
            if (cached) {
                try { this._strings = JSON.parse(cached).ui; return this._strings; } catch (e) { /* refetch */ }
            }
            try {
                var data = await api('get-translations?lang=' + encodeURIComponent(this._lang));
                this._strings = data.ui || {};
                sessionStorage.setItem(cacheKey, JSON.stringify(data));
            } catch (e) {
                this._strings = {};
            }
            return this._strings;
        },

        t: function (key, fallback) {
            if (this._strings && this._strings[key]) return this._strings[key];
            return fallback != null ? fallback : key;
        },

        /** Replace textContent on every [data-i18n] element. */
        apply: function (root) {
            var scope = root || document;
            scope.querySelectorAll('[data-i18n]').forEach(function (el) {
                var v = I18N.t(el.getAttribute('data-i18n'), null);
                if (v && v !== el.getAttribute('data-i18n')) el.textContent = v;
            });
            scope.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
                var v = I18N.t(el.getAttribute('data-i18n-placeholder'), null);
                if (v && v !== el.getAttribute('data-i18n-placeholder')) el.placeholder = v;
            });
        },

        async setLanguage(lang) {
            localStorage.setItem('yc_lang', lang);
            this._lang = lang;
            await this.load(lang);
            this.apply();
            document.documentElement.lang = lang;
            global.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang: lang } }));
        }
    };

    /* ── Yeng Points ─────────────────────────────────── */
    var Points = {
        _state: null,

        async load(force) {
            if (this._state && !force) return this._state;
            if (!Auth.isLoggedIn()) return null;
            try {
                this._state = await api('get-points');
                this.renderChip();
                return this._state;
            } catch (e) {
                return null;
            }
        },

        balance: function () { return this._state ? this._state.balance : null; },

        set: function (balance) {
            if (this._state && typeof balance === 'number') {
                this._state.balance = balance;
                this.renderChip();
            }
        },

        /** Mirror the balance into every [data-points-balance] element. */
        renderChip: function () {
            var b = this.balance();
            document.querySelectorAll('[data-points-balance]').forEach(function (el) {
                el.textContent = b == null ? '—' : Number(b).toLocaleString();
            });
        }
    };

    /* ── Notifications ───────────────────────────────── */
    var Notify = {
        async poll() {
            if (!Auth.isLoggedIn()) return null;
            try {
                var data = await api('get-notifications');
                this.render(data);
                return data;
            } catch (e) {
                return null;
            }
        },

        render: function (data) {
            var badge = document.querySelector('[data-notif-count]');
            if (badge) {
                badge.textContent = data.unread || '';
                badge.style.display = data.unread ? '' : 'none';
            }
            // Surface the most important one as a toast, once.
            var top = (data.notifications || []).filter(function (n) { return !n.read; })[0];
            if (top && !sessionStorage.getItem('yc_notif_' + top.id)) {
                sessionStorage.setItem('yc_notif_' + top.id, '1');
                if (typeof showToast === 'function') showToast(top.title, 'success', 6000);
                // Mirror to a local notification inside the native shell, since
                // there is no remote push in this stack.
                if (global.NativeBridge && NativeBridge.scheduleNotification) {
                    try { NativeBridge.scheduleNotification(top.title, top.body, 1); } catch (e) { /* optional */ }
                }
            }
        },

        async markRead() {
            if (!Auth.isLoggedIn()) return;
            try { await api('get-notifications', { method: 'POST', body: { markRead: true } }); } catch (e) { /* fine */ }
        }
    };

    /* ── Small view helpers ──────────────────────────── */
    function esc(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function plural(n, one, many) {
        return Number(n) === 1 ? one : (many || one + 's');
    }

    /** "3 minutes ago" — used across the new surfaces. */
    function timeAgo(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        if (isNaN(d)) return '';
        var secs = Math.floor((Date.now() - d.getTime()) / 1000);
        if (secs < 60) return 'just now';
        var mins = Math.floor(secs / 60);
        if (mins < 60) return mins + ' ' + plural(mins, 'minute') + ' ago';
        var hrs = Math.floor(mins / 60);
        if (hrs < 24) return hrs + ' ' + plural(hrs, 'hour') + ' ago';
        var days = Math.floor(hrs / 24);
        if (days < 30) return days + ' ' + plural(days, 'day') + ' ago';
        return d.toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    /** Render a date the way the archive recorded it.

        A bare `YYYY-MM-DD` is a calendar date, not an instant. `new Date()`
        parses it as UTC midnight, so anywhere west of Greenwich it renders
        as the previous day — and on a product whose entire pitch is
        provenance, an off-by-one date is not a cosmetic bug. Full ISO
        timestamps still go through the normal path.                        */
    function fmtDate(value, opts) {
        if (!value) return '';
        var s = String(value);
        var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        var d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('en-PH', opts || { day: 'numeric', month: 'short', year: 'numeric' });
    }

    /** Normalise a YouTube thumbnail URL to hqdefault.

        hqdefault.jpg is 480x360 — a 4:3 canvas with black bars baked into
        the pixels, 45px top and bottom, leaving 480x270 of real content.
        45/360 is exactly 12.5%.

        maxresdefault (1280x720, no bars) is the obvious upgrade but it is
        only generated for videos uploaded at 720p or better, and this
        catalogue is 2006-2016 — it 404s on most of them. mqdefault is
        bar-free but only 320x180, too soft once it fills a card.

        So: keep hqdefault, and let CSS remove the bars. Rendering it in a
        16:9 box with object-fit:cover scales the image to fill the width and
        crops (0.75 - 0.5625)/2 / 0.75 = 12.5% off the top and bottom — the
        bars exactly. Use ytArtBox() for that box.                          */
    function ytArt(url) {
        if (!url) return url;
        return String(url).replace(/\/(maxres|sd|mq|)default\.jpg/, '/hqdefault.jpg');
    }

    /** The 16:9 crop box that removes hqdefault's letterbox bars. */
    function ytArtBox() {
        return 'aspect-ratio:16/9;width:100%;height:auto;object-fit:cover;display:block';
    }

    function fmtSeconds(total) {
        var t = Math.max(0, Math.floor(total || 0));
        var m = Math.floor(t / 60);
        var s = t % 60;
        return m + ':' + String(s).padStart(2, '0');
    }

    /** Standard empty state so every new page fails the same, honest way. */
    function emptyState(title, text, actionHtml) {
        return '<div class="empty-state">'
            + '<h3 class="empty-state__title">' + esc(title) + '</h3>'
            + '<p class="empty-state__text">' + esc(text) + '</p>'
            + (actionHtml || '')
            + '</div>';
    }

    function errorState(message, retryFn) {
        var id = 'retry_' + Math.random().toString(36).slice(2, 8);
        setTimeout(function () {
            var el = document.getElementById(id);
            if (el && retryFn) el.addEventListener('click', retryFn);
        }, 0);
        return '<div class="empty-state">'
            + '<h3 class="empty-state__title">Could not load this</h3>'
            + '<p class="empty-state__text">' + esc(message || 'Try again in a moment.') + '</p>'
            + '<button class="btn btn--secondary btn--sm" id="' + id + '">Try again</button>'
            + '</div>';
    }

    /** Gate a page behind login with a real reason, not a blank redirect. */
    function requireLogin(container, pitch) {
        if (Auth.isLoggedIn()) return true;
        var el = typeof container === 'string' ? document.querySelector(container) : container;
        if (el) {
            el.innerHTML = '<div class="empty-state">'
                + '<h3 class="empty-state__title">' + esc(pitch.title) + '</h3>'
                + '<p class="empty-state__text">' + esc(pitch.text) + '</p>'
                + '<div class="flex flex-center gap-2 mt-2">'
                + '<a class="btn btn--primary btn--sm" href="/signup.html?redirect=' + encodeURIComponent(location.pathname) + '">Create an account</a>'
                + '<a class="btn btn--ghost btn--sm" href="/login.html?redirect=' + encodeURIComponent(location.pathname) + '">Log in</a>'
                + '</div></div>';
        }
        return false;
    }

    /* ── Boot ── */
    document.addEventListener('DOMContentLoaded', function () {
        I18N.load().then(function () { I18N.apply(); });
        if (Auth.isLoggedIn()) {
            Points.load();
            Notify.poll();
        }
    });

    global.Yeng = {
        I18N: I18N,
        Points: Points,
        Notify: Notify,
        esc: esc,
        plural: plural,
        timeAgo: timeAgo,
        fmtDate: fmtDate,
        ytArt: ytArt,
        ytArtBox: ytArtBox,
        fmtSeconds: fmtSeconds,
        emptyState: emptyState,
        errorState: errorState,
        requireLogin: requireLogin
    };
})(window);
