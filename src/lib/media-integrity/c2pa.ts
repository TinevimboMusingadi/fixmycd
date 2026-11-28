/**
 * Content Credentials (C2PA): a signed record, embedded by cameras, phones, editors and AI tools,
 * of how a file was made. Google, OpenAI, Adobe, Microsoft and others write one into AI images
 * and videos. We read it with the official reader (@contentauth/c2pa-node).
 */
import { sourceTypeKind, type Signal } from './score';

export type C2paFacts = {
  present: boolean;
  /** "Trusted" (signer on a configured trust list), "Valid" (intact, signer unknown) or "Invalid" (tampered). */
  validation?: string;
  /** Any action, in the file or its ingredients, says the content came from an AI model. */
  aiSource?: boolean;
  /** The active manifest records a camera capture. */
  capture?: boolean;
  /** Who signed / which app made it (claim generator or software agent). */
  generator?: string;
  error?: string;
};

type Manifest = {
  claim_generator?: string;
  claim_generator_info?: { name?: string }[];
  assertions?: { label?: string; data?: { actions?: { action?: string; digitalSourceType?: string; softwareAgent?: unknown }[] } }[];
};

const MIME_FOR_C2PA = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif', 'video/mp4', 'video/quicktime', 'image/gif']);

export async function readC2pa(bytes: Uint8Array, mime: string): Promise<C2paFacts> {
  if (!MIME_FOR_C2PA.has(mime)) return { present: false };
  try {
    const { Reader } = await import('@contentauth/c2pa-node');
    const reader = await Reader.fromAsset({ buffer: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), mimeType: mime });
    if (!reader) return { present: false };
    const store = reader.json() as { active_manifest?: string; manifests?: Record<string, Manifest>; validation_state?: string };
    const manifests = Object.values(store.manifests ?? {});
    const active = store.active_manifest ? store.manifests?.[store.active_manifest] : undefined;
    const actions = (m?: Manifest) =>
      (m?.assertions ?? []).filter((a) => a.label?.startsWith('c2pa.actions')).flatMap((a) => a.data?.actions ?? []);
    const aiSource = manifests.some((m) => actions(m).some((a) => sourceTypeKind(a.digitalSourceType) === 'ai'));
    const capture = actions(active).some((a) => sourceTypeKind(a.digitalSourceType) === 'capture');
    const agent = actions(active).map((a) => (typeof a.softwareAgent === 'string' ? a.softwareAgent : (a.softwareAgent as { name?: string })?.name)).find(Boolean);
    return {
      present: true,
      validation: store.validation_state,
      aiSource,
      capture,
      generator: (agent || active?.claim_generator_info?.[0]?.name || active?.claim_generator || '').slice(0, 120) || undefined,
    };
  } catch (e) {
    return { present: false, error: e instanceof Error ? e.message.slice(0, 200) : 'unreadable' };
  }
}

export function c2paSignals(c: C2paFacts): Signal[] {
  if (!c.present) return [];
  const s: Signal[] = [];
  const by = c.generator ? ` (${c.generator})` : '';
  if (c.aiSource) {
    if (c.validation === 'Invalid') {
      s.push({ id: 'c2pa.ai_source_invalid', weight: 40, reason: `Content Credentials say an AI model made this${by}, but the record has been altered.` });
    } else {
      s.push({ id: 'c2pa.ai_source', weight: 100, conclusive: true, reason: `Content Credentials say this was made with an AI model${by}.` });
    }
  } else if (c.capture && c.validation === 'Trusted') {
    s.push({ id: 'c2pa.trusted_capture', weight: -40, reason: `Signed Content Credentials from the camera${by} confirm it is a real capture.` });
  } else if (c.capture && c.validation === 'Valid') {
    s.push({ id: 'c2pa.capture', weight: -10, reason: `Content Credentials record a camera capture${by} (signer not verified).` });
  }
  return s;
}
