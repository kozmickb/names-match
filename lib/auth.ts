import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "nm_auth";
const TOKEN_VERSION = "v1";

export const AUTH_COOKIE_NAME = COOKIE_NAME;

function authSecret(): string {
  return (
    process.env.AUTH_SECRET ||
    process.env.VAPID_PRIVATE_KEY ||
    "names-match-fallback-please-set-AUTH_SECRET"
  );
}

export function isAuthRequired(): boolean {
  return !!process.env.APP_PASSCODE;
}

export function checkPasscode(input: string): boolean {
  const expected = process.env.APP_PASSCODE;
  if (!expected) return true;
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function makeToken(): string {
  const payload = `${TOKEN_VERSION}.${Date.now()}`;
  const sig = createHmac("sha256", authSecret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyToken(token: string | null | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [version, ts, sig] = parts;
  if (version !== TOKEN_VERSION) return false;
  const expectedSig = createHmac("sha256", authSecret()).update(`${version}.${ts}`).digest("hex");
  if (sig.length !== expectedSig.length) return false;
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
  } catch {
    return false;
  }
}
