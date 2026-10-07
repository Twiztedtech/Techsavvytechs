# TechSavvy Android app: Google Play submission guide

App id `com.techsavvyllc.app` (permanent once published). Last audited 2026-10-05.

## 1. Technical audit of the release build (all pass)

| Check | Result |
|---|---|
| Format Google requires | Android App Bundle builds (`./gradlew bundleRelease`) |
| Target API level | 36 (Google requires 35+ for new apps) |
| Minimum Android | 7.0 (API 24) |
| 16 KB memory-page requirement | Pass. The app contains no native libraries, and the zip alignment check passes |
| Debuggable in release | No |
| Cleartext (http) traffic | Not allowed (default) |
| Data backup | Off (`allowBackup=false`) |
| Permissions | `INTERNET`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `CAMERA`, `ACCESS_NETWORK_STATE`. No background location, no storage or media permission (the system photo picker is used) |
| Exported components | Only the launcher activity and Firebase's standard sign-in activities |
| Web-wrapper "minimum functionality" policy | The app bundles its own screens, works offline (site surveys, sign-in), uses GPS, camera, native Google sign-in and an offline queue, so it is far more than a website in a frame |
| Account deletion (Google requirement) | In-app (My Profile, Delete my account) and public page `https://techsavvytechs.com/delete-account` |
| Privacy policy URL | `https://techsavvytechs.com/privacy` (updated 2026-10-05 to disclose location, photos, device data and sharing) |

## 2. What you must do (cannot be done from code)

1. **Create the Play Console developer account** ($25, one time). An *individual* account is quickest. An organization account needs a D-U-N-S number and takes longer.
2. **Upload key.** Create an upload keystore (one command), keep it and its passwords somewhere safe and backed up, and I wire it into the build. Turn on **Play App Signing** at the first upload.
3. **Add Google's signing fingerprints to Firebase.** After the first upload, Play Console → Setup → App signing shows an SHA-1 and SHA-256. Add both to the Android app in Firebase (`1:921320882553:android:8fc42f3c81cf1831306fa8`). **Without this, Google sign-in works on test builds but fails for everyone who installs from the store.**
4. **Reviewer login.** Google's reviewers must be able to sign in. Create a dedicated technician account with a few sample jobs and enter its email and password under *App content → App access*. Do not use a real person's account.
5. **Screenshots.** At least 2 phone screenshots (take them on the phone). Suggested: dashboard, job with the map, clock-in, site survey.
6. **Test with real technicians first** (Internal testing track, no review wait), then request production.

Ready now in `assets/store/`: `play-icon-512.png` and `play-feature-graphic-1024x500.png`.

## 3. Store listing suggestions

- **Developer name (public):** TechSavvy Dojo (the Play account is held by TechSavvy LLC, the legal entity behind the D-U-N-S; the privacy policy names both)
- **Name:** TechSavvy Field Portal  (the app icon label is "TechSavvy")
- **Say it in the full description:** "Published by TechSavvy Dojo, operated by TechSavvy LLC, Fairfield, CA."
- **Category:** Business. **Price:** Free. **Ads:** none.
- **Short description (80 chars):** Jobs, GPS time clock, site surveys and directions for TechSavvy technicians.
- **Target audience:** 18 and over.
- **Contact:** support@techsavvytechs.com, (707) 653-6702, techsavvytechs.com
- **Privacy policy:** https://techsavvytechs.com/privacy
- **Account deletion URL:** https://techsavvytechs.com/delete-account

## 4. Data safety form: draft answers (you review and sign off; it is a legal declaration)

Applies to everything: data is **encrypted in transit**; users **can request deletion** (in-app and by URL above); the app is **not** designed for children. Nothing is used for advertising, and nothing is sold. Service providers that process data on our behalf (Google Firebase, Vercel, Resend, Twilio, QuickBooks Online) are not counted as "sharing" under Google's definitions.

| Data type | Collected | Why | Notes |
|---|---|---|---|
| Precise location | Yes | App functionality | GPS stamp at clock-in and clock-out. Foreground only. |
| Name, email address, phone number | Yes | App functionality, account management | Technician profile and notifications |
| User IDs | Yes | App functionality, account management | Firebase sign-in id |
| Photos | Yes | App functionality | Job, survey and profile photos |
| Files and documents | Yes | App functionality | W-9, signed work orders |
| Other financial info | Yes | App functionality | Pay rates and earnings shown to the technician |
| Other user-generated content | Yes | App functionality | Job notes and messages |
| Device or other IDs | Verify | App functionality | Firebase SDKs may use an installation id. Declare it if unsure. |
| App activity, web browsing, contacts, calendar, audio, health | No | | |

**Content rating questionnaire:** utility/business app. No violence, sexual content, gambling or user-to-user public content. Messaging is work messaging between known staff and technicians.

## 5. Before every release

- Raise `versionCode` (and `versionName`) in `android/app/build.gradle`; Google rejects a repeat.
- `npm run build`, `npx cap sync android`, then `gradlew bundleRelease`.
- Test on a real phone, including a cold start with no signal.

## 6. Paste-ready listing text

**App name:** TechSavvy Field Portal

**Short description (76 of 80 characters):**
`Jobs, GPS time clock, site surveys and directions for TechSavvy technicians.`

**Full description:**
```
TechSavvy Field Portal is the working tool for TechSavvy's field technicians. Accounts are issued by TechSavvy, so this app is for TechSavvy technicians and contractors only.

What you can do:
- See your assigned work orders, scope, equipment and site instructions
- Get turn-by-turn directions to the job site and preview the area on a map
- Clock in and out on site with a GPS location stamp
- Log hours, travel and supplies, add notes and job photos, and submit your work for approval
- Complete site surveys, with photos, even where there is no signal. Your changes are saved on the phone and sync when you are back online
- Collect customer signatures on work orders
- Message the office about a job and receive job notifications
- Review your approved hours and earnings

Location is used only while the app is open, when you clock in or out or ask for directions. We do not track you in the background. You can delete your account at any time from My Profile.

Published by TechSavvy Dojo, operated by TechSavvy LLC, Fairfield, CA. Privacy policy: https://techsavvytechs.com/privacy
```

**Create app screen:** App (not game) · Free · default language English (United States) · declare you accept the Developer Program Policies and US export laws.

**App access (needs login):** choose "All or some functionality is restricted", then add the reviewer login from `play-reviewer-credentials.txt` (kept outside the project). Instructions for reviewers: "Sign in with the email and password, tap Continue with Email. Two demo jobs and one demo survey are pre-loaded."

**Other declarations:** Ads: No · Target audience: 18+ · Government app: No · Financial features: None · Health: None · News: No · Data safety: see section 4 · Content rating: see section 4.
