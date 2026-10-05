# Blue mobile (Android)

The Android app for **Blue**, the gadget shop from HNG15 Lesson 2. It uses the same backend as the website, so:

- **One account:** sign in with the same email/password or Google account on the website and the app.
- **One cart:** the cart lives in the shared `cart_items` table. Supabase Realtime pushes every change, so an item added on the website appears in the app instantly, and the other way round.

## How it works

| Part | Tool |
|---|---|
| App shell | Capacitor 7 (Android) |
| Screens | TypeScript + Vite (`src/main.ts`) |
| Login, data, live sync | Supabase (same project and API as the website) |
| Google sign-in | Opens Google in a secure browser tab, returns to the app via `com.ugonwa.blue://login-callback` |
| APK build | GitHub Actions (`.github/workflows/android.yml`) |

## Download

Every push to `main` builds the APK and attaches it to a GitHub Release:

`https://github.com/<your-username>/blue-mobile/releases/latest/download/Blue.apk`

## One-time Supabase setup

1. SQL Editor: run `alter publication supabase_realtime add table public.cart_items;`
2. Authentication → URL Configuration → Redirect URLs: add `com.ugonwa.blue://login-callback`
3. Authentication → Sign In / Providers → Email: enabled, "Confirm email" off (so new accounts can sign in straight away)

## Run locally (optional)

```bash
npm install
npm run dev          # preview the screens in a browser
npm run sync         # build and copy into the Android project
```

Settings such as the Supabase URL and the website address are in `src/config.ts`.
