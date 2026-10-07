import {
  cert,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";

let cachedApp: App | null = null;

/**
 * Lazy-init Firebase Admin from env vars.
 * Expected (any one of):
 * - FIREBASE_SERVICE_ACCOUNT_JSON — full service-account JSON string
 * - FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 */
export function getFirebaseAdminApp(): App | null {
  if (cachedApp) return cachedApp;
  if (getApps().length > 0) {
    cachedApp = getApps()[0]!;
    return cachedApp;
  }

  try {
    const jsonRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
    let credential: ServiceAccount | null = null;

    if (jsonRaw) {
      credential = JSON.parse(jsonRaw) as ServiceAccount;
    } else {
      const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(
        /\\n/g,
        "\n",
      )?.trim();

      if (projectId && clientEmail && privateKey) {
        credential = { projectId, clientEmail, privateKey };
      }
    }

    if (!credential) {
      console.warn(
        "[firebase-admin] Not configured — set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY",
      );
      return null;
    }

    cachedApp = initializeApp({
      credential: cert(credential),
    });
    return cachedApp;
  } catch (error) {
    console.error("[firebase-admin] Failed to initialize", error);
    return null;
  }
}

function getMessagingOrNull(): Messaging | null {
  const app = getFirebaseAdminApp();
  if (!app) return null;
  return getMessaging(app);
}

export type SendNotificationResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
  skipped?: boolean;
};

/**
 * Send a simple FCM data/notification message to a device token.
 * Safe no-op when Firebase is not configured (returns skipped).
 */
export async function sendNotification(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<SendNotificationResult> {
  const trimmed = token.trim();
  if (!trimmed) {
    return { ok: false, error: "pushToken is empty" };
  }

  const messaging = getMessagingOrNull();
  if (!messaging) {
    console.warn(
      "[firebase-admin] sendNotification skipped — Firebase Admin not initialized",
      { title, body },
    );
    return {
      ok: false,
      skipped: true,
      error: "Firebase Admin not configured",
    };
  }

  try {
    const messageId = await messaging.send({
      token: trimmed,
      notification: { title, body },
      data: data
        ? Object.fromEntries(
            Object.entries(data).map(([k, v]) => [k, String(v)]),
          )
        : undefined,
      android: { priority: "high" },
      apns: {
        payload: {
          aps: { sound: "default" },
        },
      },
    });
    return { ok: true, messageId };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send notification";
    console.error("[firebase-admin] sendNotification failed", message);
    return { ok: false, error: message };
  }
}
