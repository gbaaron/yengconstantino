# Yeng Constantino — iOS App (Capacitor) Setup

This wraps the existing static Yeng site into a native iOS app for **internal / TestFlight**
testing and management demos. It is **not** a pure web wrapper — it bundles all web assets
locally (`www/`) and adds real native features (haptics, local notifications, Face ID),
which keeps it clear of Apple Guideline 4.2 (Minimum Functionality).

---

## 1. How it works (the architecture)

- **Pattern A — bundled-www.** `capacitor.config.json` sets `webDir: "www"`. Every HTML/CSS/JS
  asset ships inside the app binary. The app only reaches out to the network for the
  Netlify Functions API (Airtable/auth/etc.).
- **`scripts/build-www.js`** copies the site (minus dev/native files) into `www/` before every sync.
- **`js/native-bridge.js`** is a graceful bridge loaded **before** `js/app.js` on all 12 pages.
  In a browser it is a no-op. Inside the app it:
  - flips the API base to the full Netlify origin (see step 5),
  - drives haptics, status bar, splash, keyboard, Face ID, local notifications,
  - hardens the native shell (locks zoom, sets safe-area colors).
- **`js/app.js`** routes all 39 API calls through one line:
  ```js
  API_BASE: ((window.NativeBridge && window.NativeBridge.API_BASE) || '') + '/.netlify/functions',
  ```
  Browser → relative `/.netlify/functions`. Native → `https://<netlify-origin>/.netlify/functions`.

### App identity
| Key | Value |
|---|---|
| Bundle ID (`appId`) | `com.globalmedia.yeng` |
| App name | Yeng Constantino |
| Splash background | `#6C2BD9` (purple) |
| Status bar | `DARK` text on `#FAFAFC` (light UI) |
| Orientation | Portrait |

---

## 2. Status of prerequisites — both resolved

1. **Netlify origin URL — CONFIRMED.** `js/native-bridge.js` points at the live site:
   ```js
   var API_BASE = isNative ? 'https://yengconstantino.netlify.app' : '';
   ```

2. **App icons — GENERATED.** The 1254×1254 master logo lives in the repo at
   `icons/logo-master.png` (moved off the Desktop so builds are self-contained). From it,
   `icons/` also contains:
   - `icon-192.png` — PWA manifest / apple-touch-icon
   - `icon-512.png` — PWA manifest
   - `icon-1024.png` — Xcode AppIcon master (drag into Assets → AppIcon in Xcode)

   The logo is full-bleed and opaque (no transparency), which is exactly what iOS requires.

   To regenerate the resized icons after replacing `icons/logo-master.png`:
   ```bash
   sips -s format png -z 192  192  icons/logo-master.png --out icons/icon-192.png
   sips -s format png -z 512  512  icons/logo-master.png --out icons/icon-512.png
   sips -s format png -z 1024 1024 icons/logo-master.png --out icons/icon-1024.png
   ```

---

## 3. First-time setup

```bash
cd "yengconstantino"

# install deps (Capacitor + native plugins)
npm install

# build the www/ bundle from the site
npm run build:www

# add the iOS platform (creates ios/ — one time only)
npx cap add ios

# sync web assets + plugins into the iOS project
npm run cap:sync

# open in Xcode
npm run cap:open
```

## 4. Everyday workflow (after editing the site)

```bash
npm run cap:sync   # rebuilds www/ and pushes into ios/
npm run cap:open   # open Xcode, then Run on device
```

`cap:sync` = `build:www` + `npx cap sync ios`, so a single command refreshes everything.

---

## 5. Xcode configuration (do once)

### Signing
- Select the **App** target → Signing & Capabilities → set **Team** to Aaron's Apple Developer team.
- Confirm bundle identifier reads `com.globalmedia.yeng`.

### Info.plist usage strings (required or the app crashes when a feature is used)
Add these keys to `ios/App/App/Info.plist`:

| Key | Value |
|---|---|
| `NSFaceIDUsageDescription` | `Use Face ID to unlock your Yeng Constantino fan account.` |
| `ITSAppUsesNonExemptEncryption` | `NO` (Boolean false) — skips the export-compliance prompt on every upload |

Local notifications need no Info.plist string; permission is requested at runtime by
`NativeBridge.requestNotificationPermission()`.

---

## 6. Native features included in v1

| Feature | Plugin | Bridge method |
|---|---|---|
| Haptics | `@capacitor/haptics` | `hapticLight/Medium/Heavy/Success/Error/Warning` |
| Status bar | `@capacitor/status-bar` | `setStatusBarDark/Light` |
| Splash screen | `@capacitor/splash-screen` | auto-hide + `hideSplash` |
| Keyboard | `@capacitor/keyboard` | `hideKeyboard`, native resize |
| App lifecycle | `@capacitor/app` | resume → `Auth.refreshSession()`, back button |
| Face ID | `capacitor-native-biometric` | `biometricAvailable/Verify/SaveCredentials/GetCredentials/DeleteCredentials` |
| Local notifications | `@capacitor/local-notifications` | `requestNotificationPermission`, `scheduleNotification` |

**Deferred (not in v1):** push notifications (needs Firebase — add `@capacitor/push-notifications`
+ `GoogleService-Info.plist` at the repo root later), camera, offline queue.

---

## 7. TestFlight / internal distribution

1. In Xcode: **Product → Archive**.
2. Organizer → **Distribute App → App Store Connect → Upload** (or **TestFlight Internal Only**).
3. In App Store Connect, add internal testers (up to 100 on the team) — no App Review needed
   for internal testing.
4. Testers install via the TestFlight app.

For a quick device-only demo (no TestFlight): plug in the iPhone, select it in Xcode, press **Run**.
The app installs directly and runs for 7 days on a personal team, or until the provisioning
profile expires on a paid team.

---

## 8. Files added for the app

| File | Purpose |
|---|---|
| `capacitor.config.json` | Capacitor app config (id, splash, status bar) |
| `package.json` | Capacitor deps + `cap:*` scripts (existing deps kept) |
| `scripts/build-www.js` | Copies site → `www/` (dependency-free) |
| `js/native-bridge.js` | Native bridge (haptics, Face ID, notifications, API base) |
| `manifest.json` | PWA manifest (name, icons, theme) |
| `www/` | Generated bundle (git-ignore this) |
| `ios/` | Generated Xcode project (created by `npx cap add ios`) |

> Add `www/` and `ios/DerivedData/` to `.gitignore`. Keep `ios/App` committed if you want the
> Xcode project (signing, Info.plist) under version control.
