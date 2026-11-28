/**
 * Slower checks that run after a post is created (never blocking the poster).
 *
 * - Gemini (GEMINI_API_KEY): a vision model is asked how likely the image/video is AI-generated.
 *   Treated as a weak signal: it can raise a post to "suspected", never to "confirmed".
 * - Google's SynthID / Content Detection API is in limited partner preview; when access is
 *   granted it plugs in here as another detector (a positive watermark result is conclusive).
 *
 * Media is only sent to Google when GEMINI_API_KEY is set; say so in the privacy notice.
 */
import type { Signal } from './score';

export type DeepResult = { detector: string; signals: Signal[]; raw?: unknown; error?: string };

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_INLINE_BYTES = 15 * 1024 * 1024;

const PROMPT = `You are a media forensics assistant for a civic app where residents post photos and videos of real
infrastructure problems (potholes, broken water mains, streetlights). Judge whether this media was generated or
substantially altered by an AI model (text-to-image/video, generative fill) rather than captured by a camera.
Look for: inconsistent lighting/shadows, warped text or signage, impossible geometry, smeared textures, malformed
hands/vehicles, repeated patterns, over-smooth surfaces, and watermark-like artifacts.
Answer only JSON: {"ai_probability": number 0..1, "reasons": [short strings, max 3]}.`;

export function geminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export async function geminiCheck(bytes: Uint8Array, mime: string, signal?: AbortSignal): Promise<DeepResult> {
  const detector = 'gemini';
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { detector, signals: [], error: 'not configured' };
  if (bytes.byteLength > MAX_INLINE_BYTES) return { detector, signals: [], error: 'too large for inline check' };
  const model = process.env.GEMINI_DETECT_MODEL || 'gemini-flash-latest';
  try {
    const res = await fetch(`${GEMINI_URL}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      signal: signal ?? AbortSignal.timeout(45_000),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: Buffer.from(bytes).toString('base64') } }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
    });
    if (!res.ok) return { detector, signals: [], error: `HTTP ${res.status}` };
    const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    const parsed = JSON.parse(text) as { ai_probability?: unknown; reasons?: unknown };
    const p = Number(parsed.ai_probability);
    if (!Number.isFinite(p)) return { detector, signals: [], error: 'unparseable answer' };
    const prob = Math.min(1, Math.max(0, p));
    const reasons = Array.isArray(parsed.reasons) ? parsed.reasons.filter((r) => typeof r === 'string').slice(0, 3).map((r) => String(r).slice(0, 140)) : [];
    // Capped at ±25 so the model alone can lift a post to "suspected" (with other hints) but never confirm it.
    const weight = Math.round(Math.max(-15, Math.min(25, (prob - 0.5) * 60)));
    const signals: Signal[] = weight
      ? [{
          id: 'deep.gemini',
          weight,
          reason: prob >= 0.5
            ? `An AI detector rates this ${Math.round(prob * 100)}% likely to be AI-generated${reasons.length ? `: ${reasons.join('; ')}` : ''}.`
            : `An AI detector found no clear signs of AI generation (${Math.round(prob * 100)}%).`,
        }]
      : [];
    return { detector, signals, raw: { probability: prob, reasons, model } };
  } catch (e) {
    return { detector, signals: [], error: e instanceof Error ? e.message.slice(0, 160) : 'failed' };
  }
}
