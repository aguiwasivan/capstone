# Reservation Portal — Android

Separate Expo/React Native app in `CAPSTONE/mobile`. It uses the existing Django API; no website or backend source files are changed, and no separate accounts or reservation database is created.

## Included

- Existing username/email and password login for clients, agents, brokers, managers and admins.
- Android secure token storage, access-token refresh and sign-out.
- Published properties with search, subdivision/status filters, price, area and property/blueprint images.
- Client reservation requests and their current approval status.
- Pending reservation approval/decline for admins, managers and brokers, following the existing backend permissions.
- Portal notifications and account details.
- Server refresh every 15 seconds while active, immediately on foreground, pull-to-refresh and after writes. This is polling, not a push-notification service.

## Run on an Android phone

Install Expo Go compatible with SDK 58. Open PowerShell in this `mobile` folder:

```powershell
npm install
npm start
```

Scan the QR code with Expo Go. The phone and computer must be on the same network for local development.

On the login page, open **Connection settings** and enter your API URL:

- Physical phone: `http://YOUR_COMPUTER_WIFI_IP:8001/api/`
- Android emulator: `http://10.0.2.2:8001/api/`
- Hosted backend: `https://YOUR_BACKEND_DOMAIN/api/`

Use your existing account credentials. Passwords are not stored. Do not put database credentials or service keys into the app.

### Optional separate local API process

If your current backend only listens on localhost, this helper starts a separate process on port 8001 with additional LAN host names **in memory**, without editing the backend's settings or `.env`. It uses the same configured database. It does not replace a web server already running on port 8000.

```powershell
..\backend\venv\Scripts\python.exe scripts\dev_backend.py --host 192.168.1.25
```

Replace the sample IP with your computer's Wi-Fi IPv4 address from `ipconfig`. Allow the development server through the firewall for your private network if Windows prompts. Stop this helper with Ctrl+C. This is a development server, not production hosting.

The alternative `.env.example` configures a default server address at build time. Copy it to `.env`, set `EXPO_PUBLIC_API_URL`, then restart Expo. Connection settings can override it.

## Validate

```powershell
npm run typecheck
npm run lint
npm test
npm run test:backend
npm run export:android
```

`test:backend` uses an isolated in-memory SQLite database via `backend.test_settings`, never your configured production database. It checks existing logins, web-to-mobile reserved status, reservation approvals and client privacy. `export:android` validates the Android JS/assets bundle; it does not create an APK or emulate a device.

## Build an installable APK

An Expo account and Android signing configuration are required for an EAS cloud build. No cloud build or app-store publication is performed automatically.

```powershell
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
```

The preview profile builds an installable APK. Production builds use an AAB and disable cleartext HTTP; configure your hosted HTTPS API for production. The initial Android package name is `com.capstone.reservationportal`; choose your own unique identifier before store release.

## Shared data behavior and existing limitations

Both apps use the same database through the existing API. Code isolation does **not** mean data isolation: a reservation submitted or approved on the phone intentionally appears on the website.

- Mobile reads canonical lots and published map records. If their statuses disagree, it uses the more restrictive status so an unavailable lot is not offered as available.
- Ambiguous duplicate map identifiers remain visible but cannot be reserved from mobile. Correct their block/lot identifiers in the existing system first.
- The app checks availability immediately before a request and prevents repeated taps. The current backend has no transactional lot lock on reservation creation. Truly simultaneous requests from different devices still require a backend concurrency fix before a public multi-user rollout. That fix was deliberately not made because the website/backend must stay unchanged.
- Existing staff permissions and endpoint behavior remain authoritative. The app offers review actions only for pending requests and does not reopen approved or declined reservations.
- No offline reservations are queued. On a network timeout after submitting, check Reservations before trying again: the server may already have received the request.
- Notifications refresh in-app; background push notifications and cancellation are not implemented because the existing backend does not expose those mobile workflows.

References: [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/), [SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/), [APK builds](https://docs.expo.dev/build-reference/apk/).

## Handoff checks and remaining release work

- 10 mobile logic tests and 4 isolated backend contract tests passed.
- TypeScript, ESLint and all 21 Expo Doctor compatibility checks passed.
- Android JavaScript/assets export was built. A signed APK and physical-device testing have not been performed; no Android SDK/emulator or Expo signing account was available in this environment.
- The combined fingerprint of 107 existing website/backend source files is unchanged: `597463a5919b927f9814715e0ae9e4809163886d404cc2d179577f9eaeb41c1e`.
- `npm audit` reported 8 upstream dependency advisories in the SDK 57 tree (3 moderate, 5 high), involving `decode-uri-component`/`query-string`, `node-forge` and `zod`. Its suggested forced fixes cross incompatible Expo versions, so they were not applied. Review supported SDK fixes before public distribution; this handoff is for local testing.
- Before a public multi-user release, address the existing backend reservation concurrency limitation described above.

## SDK 58 and phone connection

This project now targets Expo SDK 58 to match the installed Expo Go app. Stop any old Metro process with Ctrl+C, then run npm run start:tunnel from this mobile folder. The script clears Metro cache and uses the locally installed ngrok helper. Scan the newly generated QR code, rather than opening a saved SDK 57 session. The tunnel serves the mobile app; the Django API still needs its own reachable address for login.

## Reopen the app on this Windows laptop

All source changes are saved in this mobile folder. Connect the laptop to your phone hotspot (or a reachable trusted home Wi-Fi), keep that Windows network profile Private, then run:

```powershell
npm run start:phone
```

This checks the current network, starts/restarts only the mobile API helper on port 8001 with the current IP, waits for it to respond, and starts Expo's ngrok tunnel. It leaves the website server alone. Scan the new QR code. If the IP changed, enter the printed Phone server address in the app Connection settings; saved server addresses are not silently replaced. Keep the laptop awake and connected. The mobile API remains running after closing Expo; the next launch restarts it. Logs are in `.expo/mobile-api.stdout.log` and `.expo/mobile-api.stderr.log`.

Windows may create a new Public profile after reconnecting a hotspot. Select Private only for your trusted network. The launcher reports this instead of changing Windows security settings automatically. Login still requires a reachable backend and database; saving the code cannot keep those services running while the laptop is off.
