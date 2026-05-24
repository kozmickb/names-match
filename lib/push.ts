import webpush from "web-push";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";

let configured = false;
function ensureConfigured() {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subject) return false;
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export async function sendPushTo(memberId: string, payload: PushPayload): Promise<{ sent: number; gone: number }> {
  if (!ensureConfigured()) return { sent: 0, gone: 0 };

  const subs = await db
    .select({
      id: schema.pushSubscriptions.id,
      endpoint: schema.pushSubscriptions.endpoint,
      p256dh: schema.pushSubscriptions.p256dh,
      auth: schema.pushSubscriptions.auth,
    })
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.memberId, memberId));

  let sent = 0;
  let gone = 0;
  const json = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          json,
          { TTL: 60 * 60 * 24 }
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          gone++;
          await db
            .delete(schema.pushSubscriptions)
            .where(eq(schema.pushSubscriptions.id, s.id));
        }
      }
    })
  );

  return { sent, gone };
}
