/* ═══════════════════════════════════════════════════════════════════════
   RECORD THEMES  —  the fan picks which of her songs the app wears

   Twenty years of OPM does not look like one thing. Hawak Kamay is a soft
   pink watercolour card with her signature written across it; Di Na Ganun
   is her in black with a red guitar on oxblood; Babala is a sari-sari store
   in full daylight yellow. A single fixed palette flattens all of that.

   Every palette here was sampled from that song's own artwork — the same
   frames the site already shows — and then checked by eye against the
   image. Switching moves the ground, the ink and an accent pair; structure
   never changes, so nothing reflows.

   `look` carries what colour cannot. Salamat and Hawak Kamay are literally
   the same pink template, but Ikaw Lang Talaga and Di Na Ganun are both
   oxblood and should NOT feel alike — one is a portrait ballad, the other
   has a guitar in it. So a look moves the display face, its tracking and
   case, the corner radius, the paper grain and the border weight.

   Two things are deliberately never themed:
     · green. --leaf-green means VERIFIED on this site and nothing else.
       A theme that recoloured it would make provenance a mood.
     · structure. No theme changes a size, a spacing or a layout.
   ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
    'use strict';

    var Records = {
        KEY: 'yc_record',
        DEFAULT: 'scrapbook',

        /* ── The list ────────────────────────────────────────────────
           `song` matches a title in the music catalogue, which is where the
           cover art comes from — so the picker never holds a hardcoded image
           URL and a re-uploaded video fixes itself.                        */
        LIST: [
            { key: 'scrapbook', tier: 'Free', name: 'Yeng Nation', year: null, song: null, look: 'scrapbook',
              a: '#D62D2F', b: '#F4B31C', bg: '#F7EBD5',
              note: 'The fan-club look — warm paper, red ink, tape and doodles.' },

            { key: 'hawakkamay', tier: 'Free', name: 'Hawak Kamay', year: 2006, song: 'Hawak Kamay', look: 'script',
              /* Sampled at #C0555A; a shade deeper so white on the filled
                 button clears AA (4.48 -> 4.65). Still the card's own rose. */
              a: '#BC5358', b: '#E39FA8', bg: '#FCDEDD',
              note: 'Soft pink watercolour with her signature written across it.' },

            { key: 'salamat', tier: 'Free', name: 'Salamat', year: 2007, song: 'Salamat', look: 'script',
              a: '#B8474C', b: '#EBB0A8', bg: '#FBE4E2',
              note: 'The same pink card as Hawak Kamay — both from the first records.' },

            { key: 'chinito', tier: 'Sariwang Simula', name: 'Chinito', year: 2007, song: 'Chinito', look: 'clean',
              a: '#E2643A', b: '#C9884F', bg: '#F6F1EC',
              note: 'Daylight and a white wall. The brightest thing she has.' },

            { key: 'jeepney', tier: 'Laging Nandito', name: 'Jeepney Love Story', year: 2012, song: 'Jeepney Love Story', look: 'neon',
              a: '#9E86D6', b: '#D9A2C4', bg: '#16131F',
              note: 'Violet on near-black, the title lit like a sign.' },

            { key: 'ikaw', tier: 'Sariwang Simula', name: 'Ikaw', year: 2014, song: 'Ikaw', look: 'garden',
              a: '#B8874F', b: '#8FA86A', bg: '#EFEFE3',
              note: 'A garden at a wedding. The softest frame in the catalogue.' },

            { key: 'ikawlang', tier: 'Ikaw Lamang', name: 'Ikaw Lang Talaga', year: 2015, song: 'Ikaw Lang Talaga', look: 'editorial',
              a: '#CE8A78', b: '#C2666C', bg: '#2A1519',
              note: 'Oxblood and a portrait. Italic caps, nothing else on the frame.' },

            { key: 'dinaganun', tier: 'Ikaw Lamang', name: 'Di Na Ganun', year: 2016, song: 'Di Na Ganun', look: 'rock',
              a: '#C8434E', b: '#B8877A', bg: '#2C1519',
              note: 'Same oxblood, but she is holding a red guitar this time.' },

            { key: 'babala', tier: 'Laging Nandito', name: 'Babala', year: 2016, song: 'Babala', look: 'pop',
              a: '#D98C1E', b: '#BE1420', bg: '#F7E5BC',
              note: 'A sari-sari store in full daylight. Yellow, and loud about it.' },
        ],

        get: function (key) {
            for (var i = 0; i < this.LIST.length; i++) if (this.LIST[i].key === key) return this.LIST[i];
            return null;
        },

        current: function () {
            try { return localStorage.getItem(this.KEY) || this.DEFAULT; }
            catch (e) { return this.DEFAULT; }
        },

        /** The still from that song, via Art. The default look has no record. */
        art: function (rec) {
            if (!rec || !rec.song || !global.Art) return null;
            return Art.forSong(rec.song);
        },

        /* ── Colour maths ────────────────────────────────────────────
           Three sampled colours per record; everything else is derived, so
           the list above IS the theme. Nine hand-written CSS blocks would
           have drifted the first time a swatch moved.                      */
        _rgb: function (hex) {
            var h = String(hex).replace('#', '');
            return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
        },
        _hex: function (rgb) {
            return '#' + rgb.map(function (n) {
                return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
            }).join('');
        },
        /** Relative luminance — a light cover gets a light theme by itself. */
        _lum: function (hex) {
            var v = this._rgb(hex).map(function (n) {
                var c = n / 255;
                return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
            });
            return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
        },
        _mix: function (a, b, t) {
            var x = this._rgb(a), y = this._rgb(b);
            return this._hex([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * t; }));
        },
        _rgba: function (hex, alpha) {
            var c = this._rgb(hex);
            return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + alpha + ')';
        },
        _contrast: function (a, b) {
            var x = this._lum(a), y = this._lum(b);
            if (x < y) { var t = x; x = y; y = t; }
            return (x + 0.05) / (y + 0.05);
        },
        /* A sampled accent is chosen for how the cover looks, not for whether
           it can carry text. Babala's yellow on Babala's cream is 1.87:1 —
           unreadable. This walks the accent toward the ink until it clears
           AA against the surface it will actually sit on, so every record has
           a legible version of its own colour instead of a hardcoded red. */
        /** Ink or white — whichever has more contrast on this fill. */
        _bestOn: function (accent) {
            return this._contrast(accent, '#1F1916') >= this._contrast(accent, '#FFFFFF')
                ? '#1F1916' : '#FFFFFF';
        },
        _accentInk: function (accent, surface, ink) {
            var out = accent;
            for (var i = 0; i < 24; i++) {
                if (this._contrast(out, surface) >= 4.5) break;
                out = this._mix(out, ink, 0.06);
            }
            return out;
        },

        /** Every token one record sets. Also used by the pre-paint snippet. */
        tokens: function (rec) {
            var light = this._lum(rec.bg) > 0.5;
            var ink = light ? '#1F1916' : '#F7EFE6';
            var toward = light ? '#FFFFFF' : '#FFFFFF';
            var t = {
                /* Paper */
                '--paper-main':  rec.bg,
                '--paper-light': this._mix(rec.bg, toward, light ? 0.55 : 0.07),
                '--paper-card':  this._mix(rec.bg, toward, light ? 0.42 : 0.055),
                '--paper-dark':  this._mix(rec.bg, light ? '#000000' : '#FFFFFF', light ? 0.10 : 0.12),
                '--paper-shadow': this._rgba(light ? '#51371F' : '#000000', light ? 0.14 : 0.4),

                /* Ink */
                '--ink':        ink,
                '--ink-soft':   this._rgba(ink, 0.82),
                '--ink-muted':  this._rgba(ink, 0.62),
                '--ink-faint':  this._rgba(ink, 0.62),
                '--rule':       this._rgba(ink, light ? 0.20 : 0.18),
                '--rule-dark':  this._rgba(ink, light ? 0.34 : 0.30),
                '--rule-strong': this._rgba(ink, light ? 0.34 : 0.30),

                /* Accent — the red slot, whatever colour this record's is */
                '--yeng-red':      rec.a,
                '--yeng-red-dark': this._mix(rec.a, '#000000', 0.28),
                '--yeng-red-soft': this._mix(rec.a, '#FFFFFF', 0.30),
                '--yeng-red-wash': this._mix(rec.a, light ? '#FFFFFF' : '#000000', light ? 0.72 : 0.62),

                /* Second accent — the yellow/tape slot */
                '--sun-yellow':       rec.b,
                '--sun-yellow-dark':  this._mix(rec.b, '#000000', 0.32),
                '--sun-yellow-soft':  this._mix(rec.b, '#FFFFFF', 0.34),
                '--sun-yellow-paper': this._mix(rec.b, light ? '#FFFFFF' : '#000000', light ? 0.42 : 0.35),

                /* Legacy aliases — ~20 pages and several inline <style>
                   blocks reference these names directly. */
                '--purple':        rec.a,
                '--purple-light':  this._mix(rec.a, '#FFFFFF', 0.30),
                '--purple-glow':   this._rgba(rec.a, 0.10),
                '--burgundy':      this._mix(rec.a, '#000000', 0.28),
                '--burgundy-light': rec.a,
                '--gold':          rec.b,
                '--gold-light':    this._mix(rec.b, '#FFFFFF', 0.34),
                '--amber':         rec.b,
                '--error':         rec.a,
                '--white':         this._mix(rec.bg, toward, light ? 0.42 : 0.055),
                '--off-white':     rec.bg,
                '--cream':         this._mix(rec.bg, toward, light ? 0.55 : 0.07),
                '--warm-white':    this._mix(rec.bg, toward, light ? 0.55 : 0.07),
                '--gray-50':  this._mix(rec.bg, toward, light ? 0.55 : 0.07),
                '--gray-100': this._mix(rec.bg, light ? '#000000' : '#FFFFFF', light ? 0.10 : 0.12),
                '--gray-200': this._rgba(ink, light ? 0.20 : 0.18),
                '--gray-300': this._rgba(ink, light ? 0.34 : 0.30),
                '--gray-400': this._rgba(ink, 0.62),
                '--gray-500': this._rgba(ink, 0.72),
                '--gray-600': this._rgba(ink, 0.82),
                '--gray-700': this._rgba(ink, 0.92),
                '--gray-800': ink,
                '--gray-900': ink,

                /* Flat gradients stay flat; only their colour follows. */
                '--gradient-primary':  ink,
                '--gradient-hero':     this._mix(rec.a, '#000000', 0.28),
                '--gradient-card':     this._mix(rec.bg, toward, light ? 0.42 : 0.055),
                '--gradient-cta':      rec.a,
                '--gradient-gold':     rec.b,
                '--gradient-burgundy': this._mix(rec.a, '#000000', 0.28),
                '--gradient-dark':     ink,
                '--gradient-warm':     rec.a,

                /* --coral is 'occasional tape and warm accents'. It was the
                   one accent no record could reach, so anything using it
                   stayed the same colour under every theme. */
                '--coral':       this._mix(rec.a, '#FFFFFF', 0.22),
                '--coral-light': this._mix(rec.a, '#FFFFFF', 0.48),

                /* Text that sits ON a filled accent, decided by that accent's
                   own luminance rather than the theme's — a yellow button
                   needs dark text even inside a dark record. */
                /* Whichever of ink/white actually reads better ON this
                   accent. A luminance threshold of 0.5 put white on Babala's
                   gold at 2.6:1 — the record's own colour, unreadable. */
                '--on-accent':   this._bestOn(rec.a),
                '--on-accent-2': this._bestOn(rec.b),
            };
            /* The accent, walked until it is readable as TEXT on card paper.
               Used by outline buttons and links, which set a colour on a
               surface rather than filling one. */
            var card = t['--paper-card'];
            t['--accent-ink']   = this._accentInk(rec.a, card, ink);
            t['--accent-ink-2'] = this._accentInk(rec.b, card, ink);
            return t;
        },

        apply: function (key) {
            var rec = this.get(key) || this.get(this.DEFAULT);
            var root = document.documentElement;
            root.setAttribute('data-record', rec.key);
            root.setAttribute('data-look', rec.look || 'scrapbook');
            root.setAttribute('data-tone', this._lum(rec.bg) > 0.5 ? 'light' : 'dark');

            var t = this.tokens(rec);
            Object.keys(t).forEach(function (k) { root.style.setProperty(k, t[k]); });

            var meta = document.querySelector('meta[name="theme-color"]');
            if (meta) meta.setAttribute('content', rec.bg);
            return rec;
        },

        set: function (key) {
            var rec = this.apply(key);
            try {
                localStorage.setItem(this.KEY, rec.key);
                /* Cache the resolved tokens so the inline snippet in each
                   <head> paints the right record on the very first frame.
                   Without it the page renders in the default palette and
                   snaps once this file parses, which reads as a bug. */
                localStorage.setItem(this.KEY + '_tokens', JSON.stringify({
                    look: rec.look,
                    tone: this._lum(rec.bg) > 0.5 ? 'light' : 'dark',
                    t: this.tokens(rec),
                }));
            } catch (e) { /* private mode */ }
            global.dispatchEvent(new CustomEvent('recordChanged', { detail: { record: rec } }));
            if (global.NativeBridge && NativeBridge.tap) NativeBridge.tap('LIGHT');
            return rec;
        },

        init: function () { this.apply(this.current()); },

        /* ── Who can wear what on the home screen ────────────────────
           The in-app theme is free for everyone: it is a skin, and a fan on
           the free tier seeing what Ikaw Lamang gets converts far better
           than hiding it. What membership actually buys is the HOME SCREEN
           — the icon is the part other people see. */
        TIERS: ['Free', 'Sariwang Simula', 'Laging Nandito', 'Ikaw Lamang'],

        tierRank: function (t) {
            var i = this.TIERS.indexOf(t);
            return i < 0 ? 0 : i;
        },

        /** Is this record's ICON available at the fan's tier? */
        iconUnlocked: function (rec) {
            if (!rec || !rec.tier || rec.tier === 'Free') return true;
            var mine = (global.Auth && Auth.isLoggedIn()) ? Auth.getEffectiveTier() : 'Free';
            return this.tierRank(mine) >= this.tierRank(rec.tier);
        },

        /* Only inside the app, and only on a device that allows it. Resolved
           once and cached so the picker can render synchronously. */
        _iconOK: null,
        iconsAvailable: function () {
            var self = this;
            if (this._iconOK !== null) return Promise.resolve(this._iconOK);
            if (!global.NativeBridge || !NativeBridge.appIconSupported) {
                this._iconOK = false; return Promise.resolve(false);
            }
            return NativeBridge.appIconSupported().then(function (ok) {
                self._iconOK = !!ok; return self._iconOK;
            });
        },

        /** Put this record on the home screen. */
        wearIcon: function (key) {
            var rec = this.get(key);
            if (!rec) return Promise.resolve(false);
            if (!this.iconUnlocked(rec)) {
                if (global.showToast) showToast(rec.tier + ' unlocks this icon', 'info');
                return Promise.resolve(false);
            }
            if (!global.NativeBridge || !NativeBridge.setAppIcon) return Promise.resolve(false);
            return NativeBridge.setAppIcon(rec.key).then(function (changed) {
                if (changed) {
                    try { localStorage.setItem('yc_record_icon', rec.key); } catch (e) {}
                }
                return changed;
            });
        },

        /* ── The picker ──────────────────────────────────────────────
           Covers, not swatches. Nobody picks Babala because a yellow
           rectangle appealed to them; they pick it because they can see the
           sari-sari store.                                                 */
        openPicker: function () {
            var self = this;
            var modal = document.getElementById('record-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.className = 'rec-modal';
                modal.id = 'record-modal';
                modal.innerHTML =
                    '<div class="rec-modal__backdrop" data-rec-close></div>' +
                    '<div class="rec-modal__panel" role="dialog" aria-modal="true" aria-label="Pick a record">' +
                      '<button class="rec-modal__close" data-rec-close aria-label="Close">&times;</button>' +
                      '<div class="rec-modal__head">' +
                        '<span class="rec-modal__eyebrow">Isuot ang plaka</span>' +
                        '<h2 class="rec-modal__title">Wear a record</h2>' +
                        '<p class="rec-modal__sub">Pick the one you are feeling. The whole app takes its ' +
                        'colours &mdash; and its type, corners and grain.' +
                        '<span class="rec-modal__hint" hidden> Your membership decides which ones you can ' +
                        'also put on your home screen.</span></p>' +
                      '</div>' +
                      '<div class="rec-grid" id="rec-grid"></div>' +
                    '</div>';
                document.body.appendChild(modal);
            }
            var self2 = this;
            this.iconsAvailable().then(function (ok) {
                var hint = modal.querySelector('.rec-modal__hint');
                if (hint) hint.hidden = !ok;
                self2.renderGrid();
            });
            this.renderGrid();
            modal.classList.add('is-open');
            document.body.style.overflow = 'hidden';
            this._esc = function (e) { if (e.key === 'Escape') self.closePicker(); };
            document.addEventListener('keydown', this._esc);
        },

        closePicker: function () {
            var modal = document.getElementById('record-modal');
            if (modal) modal.classList.remove('is-open');
            document.body.style.overflow = '';
            if (this._esc) document.removeEventListener('keydown', this._esc);
        },

        renderGrid: function () {
            var grid = document.getElementById('rec-grid');
            if (!grid) return;
            var self = this, cur = this.current();
            var icon = 'scrapbook';
            try { icon = localStorage.getItem('yc_record_icon') || 'scrapbook'; } catch (e) {}

            function esc(s) {
                return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
                    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
                });
            }

            grid.innerHTML = this.LIST.map(function (rec) {
                var art = self.art(rec);
                /* 16:9 like the artwork itself — a square crop cuts the song
                   title out of the left third of every one of these frames. */
                var plate = art
                    ? '<span class="rec-opt__art yt-crop"><img src="' + esc(art) + '" alt="" loading="lazy"></span>'
                    : '<span class="rec-opt__art rec-opt__art--mark" style="background-color:' + rec.bg +
                      ';--m1:' + rec.a + ';--m2:' + rec.b + '"></span>';
                var open = self.iconUnlocked(rec);
                var onHome = icon === rec.key;
                /* The icon row only exists inside the app — a browser has no
                   home screen to put anything on. */
                var iconRow = self._iconOK
                    ? '<span class="rec-opt__icon' + (open ? '' : ' is-locked') + (onHome ? ' is-on' : '') + '" ' +
                        'data-record-icon="' + rec.key + '" role="button" tabindex="0">' +
                        (onHome ? 'On your home screen'
                                : open ? 'Use as app icon'
                                       : esc(rec.tier) + ' unlocks the icon') +
                      '</span>'
                    : '';

                return '<div class="rec-opt' + (rec.key === cur ? ' is-on' : '') + '">' +
                    '<button class="rec-opt__pick" data-record-pick="' + rec.key + '" ' +
                         'title="' + esc(rec.note || rec.name) + '">' +
                      '<span class="rec-opt__frame">' + plate +
                        '<span class="rec-opt__chips"><i style="background:' + rec.a + '"></i>' +
                        '<i style="background:' + rec.b + '"></i></span>' +
                        (rec.key === cur ? '<span class="rec-opt__on">Wearing</span>' : '') +
                      '</span>' +
                      '<span class="rec-opt__name">' + esc(rec.name) + '</span>' +
                      '<span class="rec-opt__year">' + (rec.year || 'Fan club') + '</span>' +
                    '</button>' + iconRow +
                '</div>';
            }).join('');
        },

        mount: function () {
            var self = this;
            document.addEventListener('click', function (e) {
                if (!e.target.closest) return;
                if (e.target.closest('[data-record-open]')) { e.preventDefault(); self.openPicker(); return; }
                if (e.target.closest('[data-rec-close]')) { self.closePicker(); return; }
                var ico = e.target.closest('[data-record-icon]');
                if (ico) {
                    e.preventDefault();
                    var ikey = ico.getAttribute('data-record-icon');
                    self.wearIcon(ikey).then(function (changed) {
                        self.renderGrid();
                        if (changed && global.showToast) {
                            showToast((self.get(ikey) || {}).name + ' is on your home screen', 'success');
                        }
                    });
                    return;
                }
                var pick = e.target.closest('[data-record-pick]');
                if (pick) {
                    var rec = self.set(pick.getAttribute('data-record-pick'));
                    self.renderGrid();
                    if (global.showToast) showToast('Wearing ' + rec.name, 'success');
                }
            });
            /* The covers come from the catalogue, so redraw once it lands. */
            if (global.Art) Art.load().then(function () { self.renderGrid(); });

            this.mountNavButton();
        },

        /* Injected rather than pasted into 27 navs, the same way the language
           selector does it — one place to change, and no page can forget. */
        mountNavButton: function () {
            var links = document.querySelector('.nav__links');
            if (!links || document.getElementById('nav-record-btn')) return;
            var rec = this.get(this.current()) || this.get(this.DEFAULT);
            var li = document.createElement('li');
            li.className = 'nav__record-item';
            li.innerHTML = '<button class="nav__record" id="nav-record-btn" data-record-open ' +
                'aria-label="Pick which record the app wears"><i></i><span>' +
                (rec.year ? rec.name : 'Record') + '</span></button>';
            /* After the language selector when there is one, else first. */
            var lang = links.querySelector('.lang-selector');
            if (lang && lang.nextSibling) links.insertBefore(li, lang.nextSibling);
            else if (lang) links.appendChild(li);
            else links.insertBefore(li, links.firstChild);

            global.addEventListener('recordChanged', function (e) {
                var b = document.querySelector('#nav-record-btn span');
                if (b) b.textContent = e.detail.record.year ? e.detail.record.name : 'Record';
            });
        },
    };

    global.Records = Records;

    document.addEventListener('DOMContentLoaded', function () {
        Records.init();
        Records.mount();
    });
})(window);
