import { initializeApp } from "firebase/app";
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
} from "firebase/app-check";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Object.values(firebaseConfig).every(Boolean);

const app = firebaseConfigured ? initializeApp(firebaseConfig) : null;

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const functions = app
  ? getFunctions(app, import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || "us-central1")
  : null;

export const appCheck =
  app && import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY
    ? initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(
          import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY,
        ),
        isTokenAutoRefreshEnabled: true,
      })
    : null;
