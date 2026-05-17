import { AUTH_COOKIE_NAME, checkPasscode, isAuthRequired, makeToken, verifyToken } from "@/lib/auth";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isAuthRequired()) {
    return Response.json({ required: false, authed: true });
  }
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE_NAME)?.value;
  return Response.json({ required: true, authed: verifyToken(token) });
}

export async function POST(req: Request) {
  if (!isAuthRequired()) {
    return Response.json({ required: false, authed: true });
  }
  let body: { passcode?: unknown };
  try {
    body = (await req.json()) as { passcode?: unknown };
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const pin = typeof body.passcode === "string" ? body.passcode : "";
  if (!checkPasscode(pin)) {
    return Response.json({ error: "incorrect passcode" }, { status: 401 });
  }
  const token = makeToken();
  const jar = await cookies();
  jar.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 60,
  });
  return Response.json({ ok: true });
}

export async function DELETE() {
  const jar = await cookies();
  jar.delete(AUTH_COOKIE_NAME);
  return Response.json({ ok: true });
}
