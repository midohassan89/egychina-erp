/** Expo Push API — https://docs.expo.dev/push-notifications/sending-notifications/ */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export type ExpoPushPayload = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
};

/** Arabic copy for storefront Order.status values. */
const STATUS_PUSH_COPY: Record<string, { title: string; body: string }> = {
  "جاري التجهيز": {
    title: "تحديث الطلب",
    body: "طلبك رقم {id} جاري التجهيز الآن",
  },
  "Out for Delivery": {
    title: "تحديث الطلب",
    body: "طلبك رقم {id} أصبح الآن قيد التوصيل",
  },
  قيد التوصيل: {
    title: "تحديث الطلب",
    body: "طلبك رقم {id} أصبح الآن قيد التوصيل",
  },
  مكتمل: {
    title: "تم التسليم",
    body: "طلبك رقم {id} تم بنجاح. شكراً لتسوقكم من ايجي شاينا",
  },
  Delivered: {
    title: "تم التسليم",
    body: "طلبك رقم {id} تم تسليمه بنجاح. شكراً لتسوقكم من ايجي شاينا",
  },
};

export function pushCopyForOrderStatus(
  status: string,
  orderId: string,
): { title: string; body: string } | null {
  const copy = STATUS_PUSH_COPY[status];
  if (!copy) return null;
  const shortId = orderId.slice(0, 8).toUpperCase();
  return {
    title: copy.title,
    body: copy.body.replace("{id}", shortId),
  };
}

export async function sendExpoPush(
  payload: ExpoPushPayload,
): Promise<{ ok: boolean; error?: string }> {
  const token = payload.to.trim();
  if (!token) return { ok: false, error: "empty token" };

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: token,
        sound: payload.sound ?? "default",
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
      }),
    });

    const json = (await res.json()) as {
      data?: { status?: string; message?: string } | Array<{ status?: string; message?: string }>;
    };

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }

    const rows = Array.isArray(json.data)
      ? json.data
      : json.data
        ? [json.data]
        : [];
    const failed = rows.find((r) => r.status === "error");
    if (failed) {
      return { ok: false, error: failed.message ?? "expo error" };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "push failed",
    };
  }
}
