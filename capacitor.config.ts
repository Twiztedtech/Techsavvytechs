import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Reverse-DNS id. Permanent once the app is published to Google Play.
  appId: 'com.techsavvyllc.app',
  appName: 'TechSavvy',
  // The built web app is bundled inside the native shell (not loaded from the
  // live site), so it opens instantly and still renders with no signal. The
  // backend stays on techsavvytechs.com -- see src/lib/native.ts.
  webDir: 'dist',
  backgroundColor: '#030505',
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      launchAutoHide: true,
      backgroundColor: '#030505',
      showSpinner: false,
    },
    // In Capacitor, DARK means light icons/text, which is what a dark background needs.
    StatusBar: { style: 'DARK', backgroundColor: '#030505', overlaysWebView: false },
    // Light icons and text on the dark system bars (Android).
    SystemBars: { style: 'DARK' },
    FirebaseAuthentication: {
      // Sign in natively, then hand the Google ID token to the web Firebase SDK
      // (src/lib/googleSignIn.ts) so there is one Firebase user, not two.
      skipNativeAuth: true,
      providers: ['google.com'],
    },
  },
};

export default config;
