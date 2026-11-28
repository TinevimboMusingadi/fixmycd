/**
 * Removes EXIF/XMP/IPTC (GPS position, device, time) and embedded credentials from photos before
 * they are stored publicly. The facts we need were read first; the public file keeps only pixels,
 * an sRGB colour profile and the right orientation.
 */
const STRIPPABLE = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function stripImageMetadata(bytes: Uint8Array, mime: string): Promise<Uint8Array> {
  if (!STRIPPABLE.has(mime)) return bytes;
  const sharp = (await import('sharp')).default;
  const img = sharp(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), { failOn: 'error' }).rotate();
  const out =
    mime === 'image/jpeg' ? await img.jpeg({ quality: 88, mozjpeg: true }).toBuffer()
    : mime === 'image/png' ? await img.png().toBuffer()
    : await img.webp({ quality: 88 }).toBuffer();
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}
