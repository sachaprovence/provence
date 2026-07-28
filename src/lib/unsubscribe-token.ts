import crypto from "node:crypto";

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET manquant.");
  return s;
}

export function createUnsubscribeToken(leadId: string): string {
  const hmac = crypto.createHmac("sha256", secret()).update(leadId).digest("hex").slice(0, 32);
  return `${leadId}.${hmac}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  const [leadId, hmac] = token.split(".");
  if (!leadId || !hmac) return null;
  const expected = crypto.createHmac("sha256", secret()).update(leadId).digest("hex").slice(0, 32);
  const a = Buffer.from(hmac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return leadId;
}

export function unsubscribeUrl(leadId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/unsubscribe/${createUnsubscribeToken(leadId)}`;
}
