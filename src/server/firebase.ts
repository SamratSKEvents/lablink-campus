/** Firebase Admin initialisation (emulators locally, service account or ADC in production). */
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { config } from "./config.js";

let app: App | undefined;

function adminApp(): App {
  if (app) return app;
  if (getApps().length) return (app = getApps()[0]!);
  const { FIREBASE_SERVICE_ACCOUNT, FIREBASE_PROJECT_ID } = config();
  app = FIREBASE_SERVICE_ACCOUNT
    ? initializeApp({ credential: cert(JSON.parse(FIREBASE_SERVICE_ACCOUNT)), projectId: FIREBASE_PROJECT_ID })
    : initializeApp({ projectId: FIREBASE_PROJECT_ID });
  return app;
}

let firestore: Firestore | undefined;
export function db(): Firestore {
  if (!firestore) {
    firestore = getFirestore(adminApp());
    firestore.settings({ ignoreUndefinedProperties: true });
  }
  return firestore;
}

export const auth = () => getAuth(adminApp());
