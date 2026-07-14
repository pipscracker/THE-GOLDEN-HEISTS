import { useEffect } from 'react';
import { usePathname } from 'expo-router';
import { logEvent } from 'firebase/analytics';
import { firebaseAnalytics } from '@/lib/firebase';

/**
 * Logs a Firebase Analytics `page_view` event whenever the route changes.
 * `firebaseAnalytics` is only ever set on web (see lib/firebase.ts), so this
 * is a no-op on iOS/Android.
 */
export function useAnalyticsPageView() {
  const pathname = usePathname();

  useEffect(() => {
    if (!firebaseAnalytics) return;
    logEvent(firebaseAnalytics, 'page_view', {
      page_path: pathname,
      page_location: typeof window !== 'undefined' ? window.location.href : pathname,
    });
  }, [pathname]);
}
