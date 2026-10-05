import { Capacitor } from '@capacitor/core';
import { GoogleAuthProvider, signInWithCredential, signInWithPopup, type Auth } from 'firebase/auth';

// Google refuses its OAuth consent screen inside an embedded WebView
// ("disallowed_useragent"), so the popup flow works in a normal browser but
// hard-fails in the Android/iOS app. In the native app we ask the OS to run
// Google's own sign-in, get back a Google ID token, and hand it to Firebase,
// which produces the very same Firebase user the popup would have.
export async function signInWithGoogle(auth: Auth) {
  if (Capacitor.isNativePlatform()) {
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
    const result = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
    const idToken = result.credential?.idToken;
    if (!idToken) throw new Error('Google sign-in did not return a credential.');
    return signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(auth, provider);
}
