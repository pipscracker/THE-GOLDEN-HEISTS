import { Platform } from 'react-native';
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics';

// Web SDK config for the "the-golden-heists" Firebase project.
// These are PUBLIC identifiers (safe to ship in a client bundle) — the
// actual access control lives in Firebase Security Rules / Supabase RLS,
// not in keeping this config secret. Still, keep them in env vars rather
// than hardcoded so different environments (preview/prod) can differ.
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'the-golden-heists',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'the-golden-heists.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '913121825829',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export const firebaseApp: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Analytics only runs in a browser (Firebase JS SDK requirement) — guard it
// so this module is still safe to import from native iOS/Android code paths.
export let firebaseAnalytics: Analytics | null = null;

if (Platform.OS === 'web') {
  isSupported()
    .then((supported) => {
      if (supported) firebaseAnalytics = getAnalytics(firebaseApp);
    })
    .catch(() => {
      // Analytics isn't available (e.g. blocked by an ad blocker, or SSR) — non-fatal.
    });
}
