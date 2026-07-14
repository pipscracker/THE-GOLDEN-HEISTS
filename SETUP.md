# Golden Heists — Setup Guide

This turns three pieces into one working remote-control system:

1. **The app** (this Expo project) — dashboard, trades, signals, robot control, settings.
2. **Supabase** — the database + the `mt5-sync` edge function that bridges the app and MT5.
3. **The EA** (`ea/GoldenHeistsEA.mq5`) — the actual robot that runs inside MetaTrader 5.

## What was actually broken / missing

- `lib/supabase.ts`, `types/database.ts`, and `constants/theme.ts` were imported
  everywhere but didn't exist — the app couldn't have compiled.
- **The Robot tab was built (`robot.tsx`) but never added to the tab bar** in
  `app/(tabs)/_layout.tsx` — it was unreachable. This is the screen with the
  start/stop/pause controls and the live RSI/basket telemetry, so it's fixed
  here.
- There was no database schema, no edge function, and no EA — i.e. nothing
  on the other end of any of the `supabase.from(...)` calls or the
  `/functions/v1/mt5-sync/command` fetch. All three are included now.

## 1. Wire up the app

```bash
cp .env.example .env   # already has your Supabase URL + anon key, or fill in your own
npm install
npm run dev
```

## 2. Deploy the Supabase backend

You already have a project (the URL/key in `.env.example` point to it). From
the project root, with the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase link --project-ref <your-project-ref>
supabase db push                      # creates all tables + RLS from supabase/migrations/0001_init.sql
supabase functions deploy mt5-sync    # deploys the push/pull/command bridge
```

No extra secrets to set — Supabase edge functions automatically get
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in their environment.

**Security note:** this app has no login of its own. Every table's Row Level
Security policy allows full access to anyone holding the anon key, because
that's how the existing screens already talk to Supabase (no `auth.uid()`
anywhere). That's fine for a single personal account, but don't publish your
`.env` values, and don't treat the anon key as harmless the way you normally
could — combined with an open project it's a master key to every account
you store. Add Supabase Auth + per-user RLS if more than one person will
ever use this.

## 3. Add an account in the app

Open the **Settings** tab → **Add MT5 Account**. Once saved you'll land on
an Account UUID — copy it, you'll paste it into the EA next.

## 4. Install the EA in MT5

1. Copy `ea/GoldenHeistsEA.mq5` into your MetaTrader 5 `MQL5/Experts` folder
   (File → Open Data Folder → MQL5 → Experts), then compile it in MetaEditor.
2. In MT5: **Tools → Options → Expert Advisors** → check "Allow WebRequest
   for listed URL" and add your Supabase URL (the same one in `.env`),
   e.g. `https://myyyohvcchbimmhjrumf.supabase.co`.
3. Drag the EA onto an M1 or M5 chart of the symbol you want it to trade.
4. In the EA's Inputs tab, set:
   - `Inp_AccountID` — the UUID from step 3
   - `Inp_SupabaseURL` — same URL as your `.env`
   - `Inp_SupabaseAnonKey` — same anon key as your `.env`
5. Enable **AutoTrading** in MT5. The EA pushes telemetry every 10s and polls
   for settings/commands every 30s (both configurable as inputs).

## 5. Control it from the app

- **Robot tab → Status**: live RSI, basket P&L, signal log, and Start / Pause
  / Stop buttons. Commands are queued in `robot_commands` and picked up on
  the EA's next 30s poll.
- **Robot tab → EA Settings**: lot size, starting SL, max layered trades,
  basket target/floor, session hours. Saving bumps `settings_version`; the
  EA only re-reads values when that version changes.
- **Trades / Signals / Dashboard tabs**: read-only views of what the EA has
  reported, live via Supabase realtime.

## How the strategy works (as implemented in the EA)

- **Engine 1 — Reversion** (magic `888999`): price pierces the prior M5
  bar's high/low *and* RSI(7) confirms exhaustion (≥70 on a high-pierce,
  ≤30 on a low-pierce) → fades the move.
- **Engine 2 — Breakout** (magic `777666`): price breaks the prior M5
  high/low, no RSI filter → trades the continuation.
- Each signal opens `max_trades` layered positions at `lot_size`.
- Both engines share one basket P&L: hitting `target_profit_usd` closes
  everything and resets the starting SL; hitting `target_loss_usd` closes
  everything and **widens the starting SL by +10 points** for the next
  basket (this is a martingale-style pattern — see the risk note below).
- A cooldown (`Inp_CooldownSec`, default 60s) prevents instant re-entry
  right after a basket closes.
- Trading only happens inside `session_start_hour`–`session_end_hour`
  (server time) and only while the robot is enabled and not paused.

**Risk warning:** layering multiple positions per signal and widening stop
losses after a loss is a martingale-style pattern. It can look fine for a
long stretch of small wins and then produce a large, fast drawdown. Test on
a demo account first, position-size conservatively, and don't risk money
you can't afford to lose. Nothing here is financial advice.

## 6. Deploy the web app to Firebase Hosting

This app targets two surfaces from one codebase: a **web app** served by
Firebase Hosting, and a **native iOS app** built separately (Firebase
Hosting can't distribute iOS binaries — that's what TestFlight/App Store is
for). Both point at the same Supabase backend.

Firebase project: `the-golden-heists` (see `.firebaserc`).

1. **Get your Web app's Firebase config.** In the
   [Firebase Console](https://console.firebase.google.com) → Project settings →
   General → Your apps, add a **Web app** if you haven't already (the
   existing `GoogleService-Info.plist` registered an iOS app, which uses a
   *different* API key than the web app). Copy the `apiKey` and `appId` it
   gives you.

2. **Fill in `.env`** with those values:
   ```bash
   EXPO_PUBLIC_FIREBASE_API_KEY=<web app apiKey>
   EXPO_PUBLIC_FIREBASE_APP_ID=<web app appId>
   EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=<web app measurementId, if using Analytics>
   ```
   (`authDomain`, `projectId`, `storageBucket`, and `messagingSenderId` are
   already filled in — they're shared across every app in the project.)

3. **Log in and deploy**:
   ```bash
   npx firebase-tools login
   npm run deploy:web
   ```
   `deploy:web` runs `expo export --platform web` (outputs to `dist/`, which
   is what `firebase.json`'s `public` field now points at) and then
   `firebase deploy --only hosting`.

4. Your app will be live at `https://the-golden-heists.web.app` (and
   `https://the-golden-heists.firebaseapp.com`). Add a custom domain from
   **Hosting → Add custom domain** in the console if you want one.

`lib/firebase.ts` initializes the Firebase Web SDK (Analytics only, guarded
to run on web only) — it doesn't touch Supabase, which remains the source
of truth for all account/trade/robot data on every platform.

## 7. Build the iOS app

The iOS app is built with Xcode or [EAS Build](https://docs.expo.dev/build/introduction/),
not Firebase Hosting:

```bash
npx expo prebuild --platform ios   # generates the native ios/ project
```

`app.json`'s `ios.bundleIdentifier` (`com.zirowan.goldenheists`) and
`ios.googleServicesFile` already point at the `GoogleService-Info.plist` in
this repo, matching the iOS app already registered in the `the-golden-heists`
Firebase project — so Crashlytics/Analytics/etc. will pick it up automatically
if you add `@react-native-firebase/app` (or the Firebase iOS SDK directly)
later. Nothing native-Firebase-specific is wired in yet; today the plist is
just correctly in place for when you do.



```
app/                       Expo Router screens (unchanged from your upload,
                            plus the Robot tab wired in and two text fixes)
constants/theme.ts          NEW — Colors / Spacing / Radius
types/database.ts           NEW — row types for every table
lib/supabase.ts             NEW — Supabase client
lib/firebase.ts             NEW — Firebase Web SDK client (Hosting/Analytics)
hooks/useAnalyticsPageView.ts NEW — logs page_view on route change (web only)
hooks/                      otherwise unchanged
supabase/migrations/        NEW — full schema + RLS
supabase/functions/mt5-sync NEW — push / pull / command edge function
ea/GoldenHeistsEA.mq5       NEW — the actual MT5 robot
firebase.json                Hosting config, fixed to serve dist/ (Expo's
                            actual web export output) instead of public/
```
