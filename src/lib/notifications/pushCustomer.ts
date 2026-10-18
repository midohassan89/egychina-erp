import { sendNotification } from "@/lib/firebase-admin";
import { sendExpoPush } from "@/lib/push/expo";

export async function pushToCustomer(
  customer: { expoPushToken?: string | null; pushToken?: string | null },
  title: string,
  body: string,
  data?: Record<string, string>,
) {
  const expo = customer.expoPushToken?.trim() ?? "";
  const fcm = customer.pushToken?.trim() ?? "";
  if (expo) {
    await sendExpoPush({
      to: expo,
      title,
      body,
      data,
      sound: "default",
    });
  }
  if (fcm) {
    await sendNotification(fcm, title, body, data);
  }
}
