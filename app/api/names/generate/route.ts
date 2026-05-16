import Anthropic from "@anthropic-ai/sdk";
import { db, schema } from "@/db/client";
import { readUserSlug, unauthorized } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NAME_RE = /^[A-Za-z][A-Za-z'-]{1,28}[A-Za-z]$/;

function normalise(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  return trimmed
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("-");
}

export async function POST(req: Request) {
  const slug = await readUserSlug();
  if (!slug) return unauthorized();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "AI is not configured. Set ANTHROPIC_API_KEY on the server." },
      { status: 503 }
    );
  }

  let body: { count?: unknown; style?: unknown };
  try {
    body = (await req.json()) as { count?: unknown; style?: unknown };
  } catch {
    body = {};
  }

  const count = Math.min(Math.max(Math.floor(Number(body.count) || 30), 5), 60);
  const styleRaw =
    typeof body.style === "string" ? body.style.trim().slice(0, 200) : "";
  const genderRaw =
    body && typeof (body as { gender?: unknown }).gender === "string"
      ? ((body as { gender: string }).gender as string).toLowerCase()
      : "masculine";
  const gender: "masculine" | "feminine" | "unisex" =
    genderRaw === "feminine" || genderRaw === "unisex" ? (genderRaw as "feminine" | "unisex") : "masculine";

  const client = new Anthropic({ apiKey });

  const systemPrompt = [
    `You generate ${gender} first names for a couple choosing a baby name.`,
    "Output ONLY a JSON array of name strings — no prose, no markdown, no comments.",
    "Each name must be a single word (hyphens allowed), properly capitalised, suitable for a child.",
    "No surnames, no nicknames in parentheses, no diacritics, no emojis.",
    "Aim for variety unless the user asks for a specific style.",
  ].join(" ");

  const userMessage = styleRaw
    ? `Generate ${count} ${gender} first names with this vibe: ${styleRaw}. Return only a JSON array of strings.`
    : `Generate ${count} ${gender} first names spanning a variety of origins and eras. Return only a JSON array of strings.`;

  let raw: string;
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });
    raw = response.content
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return Response.json({ error: `AI call failed: ${msg}` }, { status: 502 });
  }

  let parsed: unknown;
  try {
    const match = raw.match(/\[[\s\S]*\]/);
    parsed = JSON.parse(match ? match[0] : raw);
  } catch {
    return Response.json({ error: "AI returned unparseable output." }, { status: 502 });
  }

  if (!Array.isArray(parsed)) {
    return Response.json({ error: "AI did not return a list." }, { status: 502 });
  }

  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const raw of parsed) {
    if (typeof raw !== "string") continue;
    const n = normalise(raw);
    if (!NAME_RE.test(n)) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    cleaned.push(n);
  }

  if (cleaned.length === 0) {
    return Response.json({ error: "AI returned no usable names." }, { status: 502 });
  }

  const inserted = await db
    .insert(schema.names)
    .values(cleaned.map((name) => ({ name })))
    .onConflictDoNothing({ target: schema.names.name })
    .returning({ id: schema.names.id, name: schema.names.name });

  return Response.json({
    requested: count,
    generated: cleaned.length,
    added: inserted.length,
    duplicates: cleaned.length - inserted.length,
    names: inserted,
  });
}
