/**
 * Media integrity scoring: turns evidence about a photo or video into a verdict.
 * Pure (no I/O) so the rules can be unit tested and reviewed in one place.
 *
 * Verdicts, strongest first:
 *  - ai_confirmed:     hard proof (Content Credentials or embedded metadata say an AI model made it,
 *                      or a reviewer confirmed it).
 *  - suspected_ai:     several weaker signs point to AI (or a deep detector is fairly sure).
 *  - unverified:       nothing either way (most gallery photos land here; this is not an accusation).
 *  - likely_authentic: positive signs of a real capture (trusted camera credentials, in-app capture,
 *                      camera metadata that fits the post).
 */

export type Verdict = 'ai_confirmed' | 'suspected_ai' | 'unverified' | 'likely_authentic';

export type Signal = {
  /** Stable id, e.g. "c2pa.ai_source". */
  id: string;
  /** Points toward AI (positive) or toward a real capture (negative). */
  weight: number;
  /** Plain-language reason shown to the poster and reviewers. */
  reason: string;
  /** Hard proof: on its own decides ai_confirmed. */
  conclusive?: boolean;
};

export const VERDICT_RANK: Record<Verdict, number> = {
  likely_authentic: 0,
  unverified: 1,
  suspected_ai: 2,
  ai_confirmed: 3,
};

/** Worst (most AI-like) of several verdicts, e.g. for a post with a photo and a video. */
export function worstVerdict(verdicts: (Verdict | null | undefined)[]): Verdict | null {
  let worst: Verdict | null = null;
  for (const v of verdicts) if (v && (!worst || VERDICT_RANK[v] > VERDICT_RANK[worst])) worst = v;
  return worst;
}

export type Scored = { verdict: Verdict; score: number; reasons: string[]; signals: Signal[] };

/**
 * score: 0–100 authenticity (higher = more likely a real capture), 50 = no evidence.
 * Thresholds are deliberately conservative: a post is only "suspected" when the AI-leaning
 * evidence clearly outweighs anything authentic.
 */
export function scoreSignals(signals: Signal[]): Scored {
  const total = signals.reduce((s, x) => s + x.weight, 0);
  const score = Math.max(0, Math.min(100, Math.round(50 - total)));
  let verdict: Verdict;
  if (signals.some((s) => s.conclusive && s.weight > 0)) verdict = 'ai_confirmed';
  else if (total >= 30) verdict = 'suspected_ai';
  else if (total <= -25) verdict = 'likely_authentic';
  else verdict = 'unverified';
  const reasons = [...signals]
    .filter((s) => (verdict === 'likely_authentic' ? s.weight < 0 : s.weight > 0) || verdict === 'unverified')
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .map((s) => s.reason);
  return { verdict, score: verdict === 'ai_confirmed' ? Math.min(score, 5) : score, reasons, signals };
}

/** AI generators and tools that write their name into files (Software, CreatorTool, PNG text…). */
const GENERATOR_PATTERNS: [RegExp, string][] = [
  [/midjourney/i, 'Midjourney'],
  [/dall[\s·.-]?e|openai|chatgpt|gpt-?image|sora/i, 'OpenAI (DALL·E / GPT image / Sora)'],
  [/stable[\s-]?diffusion|automatic1111|comfyui|invokeai|fooocus|sdxl|\bsd ?[123](\.\d)?\b/i, 'Stable Diffusion'],
  [/adobe firefly|firefly/i, 'Adobe Firefly'],
  [/imagen|gemini|google ai|nano[\s-]?banana|\bveo\b/i, 'Google Imagen / Gemini / Veo'],
  [/\bflux\b|black forest labs/i, 'FLUX'],
  [/ideogram/i, 'Ideogram'],
  [/leonardo\.?ai/i, 'Leonardo AI'],
  [/runway(ml)?|gen-?[234]\b/i, 'Runway'],
  [/\bkling\b|\bpika\b|\bluma\b|dream machine|hailuo|minimax/i, 'an AI video generator'],
  [/bing image creator|designer\.microsoft|copilot/i, 'Microsoft Designer / Bing Image Creator'],
  [/grok|aurora/i, 'xAI Grok'],
];

/** Name of the AI tool a metadata string points to, if any. */
export function matchGenerator(text: string | undefined | null): string | null {
  if (!text) return null;
  for (const [re, name] of GENERATOR_PATTERNS) if (re.test(text)) return name;
  return null;
}

/** IPTC digital source types that mean "made by (or with) a generative model". */
export const AI_SOURCE_TYPES = ['trainedAlgorithmicMedia', 'compositeWithTrainedAlgorithmicMedia', 'algorithmicMedia'];
/** IPTC digital source types for a real camera capture. */
export const CAPTURE_SOURCE_TYPES = ['digitalCapture', 'computationalCapture', 'negativeFilm', 'positiveFilm', 'print'];

export function sourceTypeKind(value: string | undefined | null): 'ai' | 'capture' | null {
  if (!value) return null;
  const tail = value.split('/').pop() ?? value;
  if (AI_SOURCE_TYPES.includes(tail)) return 'ai';
  if (CAPTURE_SOURCE_TYPES.includes(tail)) return 'capture';
  return null;
}

/** Great-circle distance in km. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
