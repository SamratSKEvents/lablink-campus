/**
 * Firebase client: Auth only (sign-in with the server-issued custom token).
 * Without a web config (local dev), it talks to the Auth emulator.
 */
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, inMemoryPersistence, browserSessionPersistence, setPersistence } from "firebase/auth";

const env = import.meta.env;
const useEmulator = !env.VITE_FIREBASE_API_KEY;

export const firebaseApp = initializeApp(
  useEmulator
    ? { apiKey: "demo-key", projectId: "demo-lablink", authDomain: "demo-lablink.firebaseapp.com" }
    : {
        apiKey: env.VITE_FIREBASE_API_KEY,
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        appId: env.VITE_FIREBASE_APP_ID,
      },
);

export const firebaseAuth = getAuth(firebaseApp);
if (useEmulator) connectAuthEmulator(firebaseAuth, "http://localhost:9099", { disableWarnings: true });

/** Kiosk sessions never persist; normal sessions last for the browser tab only. */
export const setSessionPersistence = (kiosk: boolean) => setPersistence(firebaseAuth, kiosk ? inMemoryPersistence : browserSessionPersistence);
