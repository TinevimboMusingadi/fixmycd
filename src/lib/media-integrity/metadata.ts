/**
 * Reads the metadata a photo carries (EXIF, XMP, IPTC, PNG text) and turns what it says about
 * where the picture came from into signals. Runs on the server before the metadata is stripped.
 */
import { distanceKm, matchGenerator, sourceTypeKind, type Signal } from './score';

export type PhotoFacts = {
  width?: number;
  height?: number;
  make?: string;
  model?: string;
  software?: string;
  takenAt?: string;
  gps?: { lat: number; lng: number };
  /** Name of an AI tool found in the metadata. */
  generator?: string;
  /** IPTC/XMP DigitalSourceType, if present. */
  digitalSourceType?: string;
  /** PNG text chunks look like a Stable Diffusion / ComfyUI generation record. */
  diffusionParameters?: boolean;
};

/** Output sizes typical of image generators (DALL·E, Midjourney, SDXL, Imagen, Flux…). */
const AI_SIZES = new Set([
  '1024x1024', '1024x1792', '1792x1024', '1536x1024', '1024x1536', '1344x768', '768x1344', '896x1152', '1152x896',
  '832x1216', '1216x832', '512x512', '768x768', '2048x2048', '1408x768', '768x1408', '1536x640', '640x1536',
]);

/** tEXt / iTXt chunks of a PNG (keyword → text). Generators store their prompt and settings here. */
export function pngTextChunks(bytes: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return out;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder('latin1');
  let off = 8;
  for (let n = 0; n < 200 && off + 8 <= bytes.length; n++) {
    const len = view.getUint32(off);
    const type = dec.decode(bytes.subarray(off + 4, off + 8));
    const start = off + 8;
    const end = start + len;
    if (end > bytes.length) break;
    if (type === 'tEXt' || type === 'iTXt') {
      const data = bytes.subarray(start, end);
      const zero = data.indexOf(0);
      if (zero > 0) {
        const key = dec.decode(data.subarray(0, zero));
        let rest = data.subarray(zero + 1);
        // iTXt: compression flag, method, language\0, translated keyword\0, text (uncompressed only)
        if (type === 'iTXt') {
          if (rest[0] !== 0) { off = end + 4; continue; }
          rest = rest.subarray(2);
          const lang = rest.indexOf(0);
          rest = rest.subarray(lang + 1);
          const tk = rest.indexOf(0);
          rest = rest.subarray(tk + 1);
        }
        out[key] = new TextDecoder('utf-8').decode(rest).slice(0, 4000);
      }
    }
    if (type === 'IEND') break;
    off = end + 4; // skip CRC
  }
  return out;
}

export async function readPhotoFacts(bytes: Uint8Array, mime: string): Promise<PhotoFacts> {
  const facts: PhotoFacts = {};
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    const sharp = (await import('sharp')).default;
    const meta = await sharp(buf, { animated: false }).metadata();
    facts.width = meta.autoOrient?.width ?? meta.width;
    facts.height = meta.autoOrient?.height ?? meta.height;
  } catch {
    // Unreadable by sharp (e.g. some HEIC files): carry on with what exifr can read.
  }
  try {
    const exifr = (await import('exifr')).default;
    const tags = (await exifr.parse(buf, { tiff: true, exif: true, gps: true, xmp: true, iptc: true, mergeOutput: true })) as Record<string, unknown> | undefined;
    if (tags) {
      const str = (k: string) => (typeof tags[k] === 'string' ? (tags[k] as string).trim().slice(0, 200) : undefined);
      facts.make = str('Make');
      facts.model = str('Model');
      facts.software = str('Software') ?? str('CreatorTool');
      const taken = tags.DateTimeOriginal ?? tags.CreateDate;
      if (taken instanceof Date && !Number.isNaN(taken.getTime())) facts.takenAt = taken.toISOString();
      if (typeof tags.latitude === 'number' && typeof tags.longitude === 'number') {
        facts.gps = { lat: tags.latitude, lng: tags.longitude };
      }
      facts.digitalSourceType = str('DigitalSourceType') ?? str('DigitalSourceFileType');
      const text = ['Software', 'CreatorTool', 'ImageDescription', 'UserComment', 'Artist', 'Credit', 'Description', 'Creator', 'HistorySoftwareAgent']
        .map((k) => (typeof tags[k] === 'string' ? tags[k] : Array.isArray(tags[k]) ? (tags[k] as unknown[]).join(' ') : ''))
        .join(' ');
      facts.generator = matchGenerator(text) ?? undefined;
    }
  } catch {
    // No or malformed metadata.
  }
  if (mime === 'image/png') {
    const chunks = pngTextChunks(bytes);
    const all = Object.entries(chunks).map(([k, v]) => `${k} ${v}`).join(' ');
    facts.diffusionParameters =
      'parameters' in chunks && /steps:\s*\d+/i.test(chunks.parameters) ||
      'prompt' in chunks && /"class_type"|KSampler/i.test(chunks.prompt) ||
      'workflow' in chunks;
    facts.generator ??= matchGenerator(all) ?? undefined;
  }
  return facts;
}

/** Signals from photo metadata alone (known at upload time). */
export function photoSignals(f: PhotoFacts): Signal[] {
  const s: Signal[] = [];
  const kind = sourceTypeKind(f.digitalSourceType);
  if (kind === 'ai') {
    s.push({ id: 'meta.ai_source', weight: 100, conclusive: true, reason: 'The photo’s metadata labels it as created by an AI model.' });
  }
  if (f.diffusionParameters) {
    s.push({ id: 'meta.diffusion_params', weight: 100, conclusive: true, reason: 'The file contains an AI image generator’s settings (prompt, sampler, steps).' });
  }
  if (f.generator) {
    s.push({ id: 'meta.generator', weight: 45, reason: `The photo’s metadata names an AI tool: ${f.generator}.` });
  }
  const hasCamera = !!(f.make || f.model);
  if (hasCamera && f.takenAt) {
    s.push({ id: 'meta.camera', weight: -15, reason: `Camera details are present (${[f.make, f.model].filter(Boolean).join(' ')}).` });
  }
  if (kind === 'capture') {
    s.push({ id: 'meta.capture_source', weight: -10, reason: 'The metadata says it is a camera capture.' });
  }
  if (!hasCamera && f.width && f.height && AI_SIZES.has(`${f.width}x${f.height}`)) {
    s.push({ id: 'meta.ai_size', weight: 15, reason: `No camera details, and the size (${f.width}×${f.height}) is typical of AI image generators.` });
  }
  return s;
}

/** Signals that need the post itself (pin and date), added when the post is created. */
export function contextSignals(f: PhotoFacts, post: { lat?: number | null; lng?: number | null; occurredAt?: Date | null }): Signal[] {
  const s: Signal[] = [];
  if (f.gps && post.lat != null && post.lng != null) {
    const km = distanceKm(f.gps, { lat: post.lat, lng: post.lng });
    if (km <= 2) s.push({ id: 'ctx.gps_match', weight: -10, reason: 'Where the photo was taken matches the post’s location.' });
    else if (km > 50) s.push({ id: 'ctx.gps_far', weight: 15, reason: `The photo was taken about ${Math.round(km)} km from the post’s location.` });
  }
  if (f.takenAt && post.occurredAt) {
    const days = Math.abs(new Date(f.takenAt).getTime() - post.occurredAt.getTime()) / 86_400_000;
    if (days > 60) s.push({ id: 'ctx.date_far', weight: 10, reason: `The photo was taken about ${Math.round(days)} days away from when the problem was reported.` });
  }
  return s;
}
