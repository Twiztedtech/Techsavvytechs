import { Capacitor } from '@capacitor/core';

// True only inside the Android/iOS app, never in a browser tab.
export const isNativeApp = Capacitor.isNativePlatform();

// The live backend. In the app the web bundle is served from the phone itself
// (https://localhost), so a relative "/api/..." would hit the phone, not us.
export const API_ORIGIN = 'https://techsavvytechs.com';

export const toApiUrl = (url: string) => (url.startsWith('/api/') ? `${API_ORIGIN}${url}` : url);

// Point every relative /api call at the live server. Done once, at startup, by
// wrapping fetch, so none of the ~50 call sites have to know about the app.
export function installNativeApiBase() {
  if (!isNativeApp) return;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string') return originalFetch(toApiUrl(input), init);
    if (input instanceof URL && input.origin === window.location.origin && input.pathname.startsWith('/api/')) {
      return originalFetch(`${API_ORIGIN}${input.pathname}${input.search}`, init);
    }
    if (input instanceof Request) {
      const target = new URL(input.url);
      if (target.origin === window.location.origin && target.pathname.startsWith('/api/')) {
        return originalFetch(new Request(`${API_ORIGIN}${target.pathname}${target.search}`, input), init);
      }
    }
    return originalFetch(input, init);
  };
}
