/* Yeng Constantino — Native Bridge
 * Detects whether the app is running inside Capacitor (iOS native)
 * or in a regular browser, and provides the right API base URL,
 * haptic feedback, status bar, splash, keyboard, Face ID login, and
 * local-notification helpers.
 *
 * This file is safe to load in the browser — it no-ops gracefully.
 * Include it BEFORE js/app.js on every page.
 */
(function (global) {
  'use strict';

  // ---- Native detection ----
  var isNative = !!(global.Capacitor && global.Capacitor.isNativePlatform && global.Capacitor.isNativePlatform());

  // ---- API base URL ----
  // In browser: empty string (relative URLs work against same origin).
  // In native:  full Netlify URL (assets are local in the app bundle,
  //             but the API still lives on Netlify).
  // NOTE (Aaron): confirm this is Yeng's real Netlify subdomain. If the
  // deployed site lives at a different URL, change ONLY this one line.
  var API_BASE = isNative ? 'https://yengconstantino.netlify.app' : '';

  // ---- Haptic feedback ----
  var Haptics = (isNative && global.Capacitor.Plugins && global.Capacitor.Plugins.Haptics) || null;

  function hapticLight() {
    if (Haptics && Haptics.impact) {
      try { Haptics.impact({ style: 'LIGHT' }); } catch (e) {}
    }
  }
  function hapticMedium() {
    if (Haptics && Haptics.impact) {
      try { Haptics.impact({ style: 'MEDIUM' }); } catch (e) {}
    }
  }
  function hapticHeavy() {
    if (Haptics && Haptics.impact) {
      try { Haptics.impact({ style: 'HEAVY' }); } catch (e) {}
    }
  }
  function hapticSuccess() {
    if (Haptics && Haptics.notification) {
      try { Haptics.notification({ type: 'SUCCESS' }); } catch (e) {}
    } else {
      hapticLight();
    }
  }
  function hapticError() {
    if (Haptics && Haptics.notification) {
      try { Haptics.notification({ type: 'ERROR' }); } catch (e) {}
    } else {
      hapticHeavy();
    }
  }
  function hapticWarning() {
    if (Haptics && Haptics.notification) {
      try { Haptics.notification({ type: 'WARNING' }); } catch (e) {}
    } else {
      hapticMedium();
    }
  }

  // ---- Status bar ----
  // The status bar sits directly on the nav, which paints --cream.
  var StatusBar = (isNative && global.Capacitor.Plugins && global.Capacitor.Plugins.StatusBar) || null;

  /* Named for the BACKGROUND they are used against, matching Capacitor's
     own convention. setStatusBarDark() is for a dark surface (Studio, the
     player chrome); setStatusBarLight() is for paper. */
  function setStatusBarDark() {
    if (StatusBar && StatusBar.setStyle) {
      try { StatusBar.setStyle({ style: 'DARK' }); } catch (e) {}
    }
  }
  function setStatusBarLight() {
    if (StatusBar && StatusBar.setStyle) {
      try { StatusBar.setStyle({ style: 'LIGHT' }); } catch (e) {}
    }
  }

  // ---- Splash screen ----
  var SplashScreen = (isNative && global.Capacitor.Plugins && global.Capacitor.Plugins.SplashScreen) || null;

  function hideSplash() {
    if (SplashScreen && SplashScreen.hide) {
      try { SplashScreen.hide(); } catch (e) {}
    }
  }

  // ---- Keyboard ----
  var Keyboard = (isNative && global.Capacitor.Plugins && global.Capacitor.Plugins.Keyboard) || null;

  function hideKeyboard() {
    if (Keyboard && Keyboard.hide) {
      try { Keyboard.hide(); } catch (e) {}
    }
  }

  // ---- App lifecycle ----
  var App = (isNative && global.Capacitor.Plugins && global.Capacitor.Plugins.App) || null;

  // Re-validate the fan session when the app returns from the background.
  if (App && App.addListener) {
    try {
      App.addListener('appStateChange', function (state) {
        if (state.isActive && global.Auth && typeof global.Auth.refreshSession === 'function') {
          global.Auth.refreshSession();
        }
      });
    } catch (e) {}
  }

  // Android back button (no-op on iOS, included for completeness).
  if (App && App.addListener) {
    try {
      App.addListener('backButton', function () {
        if (global.history.length > 1) {
          global.history.back();
        }
      });
    } catch (e) {}
  }

  // ---- Deep links from home-screen widgets ----
  // Widgets open the app with a URL like: yengapp://open?page=profile.html%23orders
  // We parse the `page` param and navigate the WebView to that in-app page.
  function routeWidgetUrl(rawUrl) {
    if (!rawUrl) return;
    try {
      // Only handle our own scheme.
      if (rawUrl.indexOf('yengapp://') !== 0) return;
      var queryPart = rawUrl.split('?')[1] || '';
      var page = '';
      queryPart.split('&').forEach(function (pair) {
        var kv = pair.split('=');
        if (kv[0] === 'page') page = decodeURIComponent(kv[1] || '');
      });
      if (!page) return;
      // Guard against navigating off-site: only allow relative in-app pages.
      if (page.indexOf('://') !== -1 || page.charAt(0) === '/') return;
      // If we're already on the target path, just update the hash so the page reacts.
      var targetPath = page.split('#')[0];
      var currentFile = (global.location.pathname.split('/').pop()) || '';
      if (targetPath && currentFile === targetPath && page.indexOf('#') !== -1) {
        global.location.hash = page.split('#')[1];
        // Fire hashchange manually in case the browser dedupes an identical hash.
        try { global.dispatchEvent(new Event('hashchange')); } catch (e) {}
      } else {
        global.location.href = page;
      }
    } catch (e) {}
  }

  if (App && App.addListener) {
    try {
      App.addListener('appUrlOpen', function (data) {
        routeWidgetUrl(data && data.url);
      });
    } catch (e) {}

    // Also handle the case where the app was launched cold from a widget tap.
    if (App.getLaunchUrl) {
      try {
        App.getLaunchUrl().then(function (res) {
          if (res && res.url) routeWidgetUrl(res.url);
        }).catch(function () {});
      } catch (e) {}
    }
  }

  // ---- Native app hardening ----
  if (isNative) {
    // Immediately configure the status bar (don't wait for DOMContentLoaded).
    if (StatusBar) {
      try {
        // Capacitor's Style.Light means DARK TEXT for a light background, and
        // Style.Dark means light text for a dark one -- the naming describes
        // the background, not the glyphs. This said DARK, which was right when
        // the app was near-black; against warm paper it painted the clock and
        // battery white on white. #FAFAFC was a cool grey that also did not
        // match --paper.
        StatusBar.setStyle({ style: 'LIGHT' });
        if (StatusBar.setBackgroundColor) StatusBar.setBackgroundColor({ color: '#FBF8F2' });
        if (StatusBar.setOverlaysWebView) StatusBar.setOverlaysWebView({ overlay: true });
      } catch (e) {}
    }

    // Prevent pinch-to-zoom gestures.
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); }, { passive: false });
    document.addEventListener('gesturechange', function (e) { e.preventDefault(); }, { passive: false });
    document.addEventListener('gestureend', function (e) { e.preventDefault(); }, { passive: false });

    // Prevent double-tap zoom.
    var lastTouchEnd = 0;
    document.addEventListener('touchend', function (e) {
      var now = Date.now();
      if (now - lastTouchEnd <= 300) { e.preventDefault(); }
      lastTouchEnd = now;
    }, { passive: false });

    // Add a class to <body> so CSS can target native-specific styles.
    document.addEventListener('DOMContentLoaded', function () {
      document.body.classList.add('capacitor-native');
      // Hide the splash once the DOM is ready.
      setTimeout(hideSplash, 300);
    });

    // If the DOM already loaded (script loaded late).
    if (document.readyState !== 'loading') {
      document.body.classList.add('capacitor-native');
    }
  }

  // ---- Biometric login (Face ID / Touch ID) ----
  // Uses the capacitor-native-biometric plugin when present (NativeBiometric).
  // Credentials are stored in the iOS Keychain by the plugin, never in JS/localStorage.
  // Everything no-ops gracefully in the browser or when the plugin is missing.
  var Biometric = (isNative && global.Capacitor.Plugins && global.Capacitor.Plugins.NativeBiometric) || null;

  // Keychain "server" key the plugin uses to namespace stored credentials.
  var BIOMETRIC_SERVER = 'yengconstantino.official';

  /** Resolves true only if the device has Face ID / Touch ID set up and usable. */
  function biometricAvailable() {
    if (!Biometric || !Biometric.isAvailable) return Promise.resolve(false);
    return Biometric.isAvailable()
      .then(function (result) { return !!(result && result.isAvailable); })
      .catch(function () { return false; });
  }

  /** Prompts the Face ID / Touch ID sheet. Resolves true if the user passed. */
  function biometricVerify(reason) {
    if (!Biometric || !Biometric.verifyIdentity) return Promise.resolve(false);
    return Biometric.verifyIdentity({
      reason: reason || 'Unlock your fan account',
      title: 'Yeng Constantino',
      subtitle: '',
      description: ''
    }).then(function () { return true; }).catch(function () { return false; });
  }

  /** Saves the email/password in the secure Keychain for later biometric login. */
  function biometricSaveCredentials(username, password) {
    if (!Biometric || !Biometric.setCredentials) return Promise.resolve(false);
    return Biometric.setCredentials({
      username: String(username || ''),
      password: String(password || ''),
      server: BIOMETRIC_SERVER
    }).then(function () { return true; }).catch(function () { return false; });
  }

  /** Returns { username, password } from the Keychain, or null. Call after biometricVerify(). */
  function biometricGetCredentials() {
    if (!Biometric || !Biometric.getCredentials) return Promise.resolve(null);
    return Biometric.getCredentials({ server: BIOMETRIC_SERVER })
      .then(function (creds) {
        if (creds && creds.username) return { username: creds.username, password: creds.password };
        return null;
      })
      .catch(function () { return null; });
  }

  /** Clears stored credentials (call on logout / "forget me"). */
  function biometricDeleteCredentials() {
    if (!Biometric || !Biometric.deleteCredentials) return Promise.resolve(false);
    return Biometric.deleteCredentials({ server: BIOMETRIC_SERVER })
      .then(function () { return true; }).catch(function () { return false; });
  }

  // ---- Local notifications ----
  // Uses @capacitor/local-notifications (LocalNotifications) when present.
  // Local-only (no remote push), so no APNs/Firebase setup is required.
  var LocalNotifications = (isNative && global.Capacitor.Plugins && global.Capacitor.Plugins.LocalNotifications) || null;

  /** Asks the OS for notification permission. Resolves true if granted. */
  function requestNotificationPermission() {
    if (!LocalNotifications || !LocalNotifications.requestPermissions) return Promise.resolve(false);
    return LocalNotifications.requestPermissions()
      .then(function (res) { return !!(res && res.display === 'granted'); })
      .catch(function () { return false; });
  }

  /**
   * Schedule (or immediately fire) a local notification.
   * opts: { title, body, id?, at?(Date), extra? }
   */
  function scheduleNotification(opts) {
    if (!LocalNotifications || !LocalNotifications.schedule) return Promise.resolve(false);
    opts = opts || {};
    var note = {
      id: opts.id || Math.floor(Date.now() % 2147483647),
      title: opts.title || 'Yeng Constantino',
      body: opts.body || '',
      schedule: opts.at ? { at: opts.at } : undefined,
      extra: opts.extra || null
    };
    return LocalNotifications.schedule({ notifications: [note] })
      .then(function () { return true; }).catch(function () { return false; });
  }

  // ---- Widget data sharing (App Group via @capacitor/preferences) ----
  // Home-screen widgets run in a SEPARATE sandboxed process and CANNOT read
  // the webview's localStorage. To let the "Fan Tier" and "Past Merch Orders"
  // widgets fetch on the fan's behalf, we mirror the JWT + a little profile
  // info into the shared App Group (group.com.globalmedia.yeng).
  //
  // NOTE: @capacitor/preferences CANNOT do this — its `group` option is only a
  // key-prefix inside the app's private UserDefaults.standard, which the widget
  // (a separate process) can never read. So we use our own tiny native plugin,
  // WidgetBridge, which writes straight into UserDefaults(suiteName: the group)
  // with the same "CapacitorStorage." prefix the Swift widget reads, then nudges
  // WidgetKit to reload. No-ops gracefully in the browser.
  // In a plain-HTML / no-bundler Capacitor app the @capacitor/core JS package is
  // never loaded. That package is what normally creates the Capacitor.Plugins.<Name>
  // proxies AND provides Capacitor.registerPlugin() — so in this app NEITHER exists,
  // and both paths return undefined even though WidgetBridge IS compiled + registered
  // natively. The natively-injected bridge (native-bridge.js) does, however, expose
  // the raw low-level primitive Capacitor.nativePromise(pluginId, method, options),
  // which posts straight to the native plugin and resolves with its result. That is
  // the correct call path here. No-ops gracefully in the browser.
  function callWidgetBridge(method, options) {
    if (!isNative || !global.Capacitor ||
        typeof global.Capacitor.nativePromise !== 'function') {
      return Promise.resolve(false);
    }
    return global.Capacitor
      .nativePromise('WidgetBridge', method, options || {})
      .then(function () { return true; })
      .catch(function () { return false; });
  }

  /**
   * Mirror the fan's token + profile into the shared App Group so widgets
   * can authenticate their own fetches. Call on login / session set.
   */
  function syncWidgetData(user, token) {
    user = user || {};
    return callWidgetBridge('sync', {
      token: String(token || ''),
      tier: String(user.membershipTier || 'Free'),
      name: String(user.name || ''),
      username: String(user.username || ''),
      role: String(user.role || 'User')
    });
    // The plugin also calls WidgetCenter.reloadAllTimelines() after writing,
    // and AppDelegate reloads again on background, so the widget refreshes
    // promptly once the fan switches back to the home screen.
  }

  /** Wipe the shared widget data on logout so widgets fall back to public state. */
  function clearWidgetData() {
    return callWidgetBridge('clear', {});
  }

  // ---- Home-screen app icon ----
  // Bridges AppIconPlugin.swift, so the record a fan is wearing inside the app
  // is the icon they see on the home screen. Same call path as the widget
  // bridge: Capacitor.nativePromise, since @capacitor/core is never bundled
  // in a plain-HTML Capacitor app. No-ops in the browser, where there is no
  // home-screen icon to change.
  function callAppIcon(method, options) {
    if (!isNative || !global.Capacitor ||
        typeof global.Capacitor.nativePromise !== 'function') {
      return Promise.reject(new Error('not native'));
    }
    return global.Capacitor.nativePromise('AppIcon', method, options || {});
  }

  /** True only inside the app, on a device that allows alternate icons. */
  function appIconSupported() {
    return callAppIcon('isSupported', {})
      .then(function (r) { return !!(r && r.supported); })
      .catch(function () { return false; });
  }

  /**
   * Wear `key` on the home screen. '' or 'scrapbook' restores the default
   * artwork. Resolves false rather than throwing when it cannot be done, so
   * a failed icon swap never blocks the theme change that triggered it.
   *
   * NOTE: iOS shows its own "You have changed the icon" alert on every real
   * change and there is no supported way to suppress it — so only call this
   * from a deliberate fan action, never on page load.
   */
  function setAppIcon(key) {
    return callAppIcon('set', { name: String(key || '') })
      .then(function (r) { return !!(r && r.changed); })
      .catch(function () { return false; });
  }

  // ---- Live Activities (Lock Screen + Dynamic Island, iOS 16.1+) ----
  // Bridges the web layer to LiveActivityPlugin.swift (App target), which drives
  // ActivityKit. Same call path as callWidgetBridge: the raw
  // Capacitor.nativePromise primitive, since @capacitor/core is never bundled.
  // Unlike the widget bridge, these resolve with the native result object
  // (e.g. { supported } or { success, id }) so callers can read it back.
  function callLiveActivity(method, options) {
    if (!isNative || !global.Capacitor ||
        typeof global.Capacitor.nativePromise !== 'function') {
      return Promise.resolve(null);
    }
    return global.Capacitor
      .nativePromise('LiveActivity', method, options || {})
      .then(function (res) { return res || { success: true }; })
      .catch(function () { return null; });
  }

  /** Resolves to true if Live Activities are supported + enabled on this device. */
  function liveActivitySupported() {
    return callLiveActivity('isSupported', {}).then(function (res) {
      return !!(res && res.supported);
    });
  }

  /**
   * Start a Concert Live Activity counting down to showtime.
   * opts: { id, title, venue, showDate, statusLine, phase }
   *   - id         a stable key you pick, used later to update/end this one
   *   - title      concert name, e.g. "Yeng Live in Manila"
   *   - venue      e.g. "Araneta Coliseum"
   *   - showDate   ISO-8601 string or epoch (drives the relative timer)
   *   - statusLine short phrase, e.g. "Doors open 6:00 PM"
   *   - phase      "countdown" | "soon" | "live" | "ended"
   */
  function startConcertActivity(opts) {
    return callLiveActivity('startConcert', opts || {});
  }

  /** Update a running Concert activity. opts: { id, statusLine, showDate, phase } */
  function updateConcertActivity(opts) {
    return callLiveActivity('updateConcert', opts || {});
  }

  /**
   * Start a Ticket Drop Live Activity.
   * opts: { id, eventTitle, dropDate, remaining, statusLine, phase }
   *   - phase "waiting" | "live" | "soldout"; remaining < 0 means unknown
   */
  function startTicketDropActivity(opts) {
    return callLiveActivity('startTicketDrop', opts || {});
  }

  /** Update a running Ticket Drop activity. opts: { id, remaining, statusLine, dropDate, phase } */
  function updateTicketDropActivity(opts) {
    return callLiveActivity('updateTicketDrop', opts || {});
  }

  /** End one Live Activity by the id you started it with. opts: { id } */
  function endLiveActivity(id) {
    return callLiveActivity('end', { id: String(id || '') });
  }

  /** End every Yeng Live Activity currently on the Lock Screen / Dynamic Island. */
  function endAllLiveActivities() {
    return callLiveActivity('endAll', {});
  }

  // ---- Export ----
  global.NativeBridge = {
    isNative: isNative,
    API_BASE: API_BASE,
    hapticLight: hapticLight,
    hapticMedium: hapticMedium,
    hapticHeavy: hapticHeavy,
    hapticSuccess: hapticSuccess,
    hapticError: hapticError,
    hapticWarning: hapticWarning,
    setStatusBarDark: setStatusBarDark,
    setStatusBarLight: setStatusBarLight,
    hideSplash: hideSplash,
    hideKeyboard: hideKeyboard,
    // Biometric login
    biometricAvailable: biometricAvailable,
    biometricVerify: biometricVerify,
    biometricSaveCredentials: biometricSaveCredentials,
    biometricGetCredentials: biometricGetCredentials,
    biometricDeleteCredentials: biometricDeleteCredentials,
    // Local notifications
    requestNotificationPermission: requestNotificationPermission,
    scheduleNotification: scheduleNotification,
    // Widget data sharing (App Group)
    syncWidgetData: syncWidgetData,
    clearWidgetData: clearWidgetData,
    appIconSupported: appIconSupported,
    setAppIcon: setAppIcon,
    // Live Activities (ActivityKit, iOS 16.1+)
    liveActivitySupported: liveActivitySupported,
    startConcertActivity: startConcertActivity,
    updateConcertActivity: updateConcertActivity,
    startTicketDropActivity: startTicketDropActivity,
    updateTicketDropActivity: updateTicketDropActivity,
    endLiveActivity: endLiveActivity,
    endAllLiveActivities: endAllLiveActivities,
  };

})(window);
