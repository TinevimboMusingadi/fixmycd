import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { canContribute, getSessionUser, readOnlyAccount } from '../../../lib/auth';
import { sniffMediaType } from '../../../lib/file-type';
import { badRequest, serverError } from '@/lib/http';
import { MAX_DATA_URL_LENGTH } from '@/lib/media-url';
import { enforceRateLimit } from '@/lib/rate-limit';
import { fastCheck, publicSummary, saveUploadCheck } from '@/lib/media-integrity';
import { stripImageMetadata } from '@/lib/media-integrity/strip';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!canContribute(user.role)) return readOnlyAccount();

    const limited = await enforceRateLimit('upload', user.id);
    if (limited) return limited;

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return badRequest('Expected a multipart/form-data upload');
    }
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return badRequest('No file provided');
    }
    if (file.size === 0) {
      return badRequest('The file is empty');
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'File exceeds 10MB limit' }, { status: 413 });
    }

    const original = new Uint8Array(await file.arrayBuffer());
    const type = sniffMediaType(original);
    if (!type) {
      return NextResponse.json(
        { error: 'Unsupported file type. Upload a photo (JPEG, PNG, WebP, GIF, HEIC), video (MP4, MOV, WebM) or audio (MP3, M4A, OGG, WAV).' },
        { status: 415 }
      );
    }

    // Integrity checks read the original file (Content Credentials, metadata), then photos are
    // stored without their metadata so GPS position, device and time aren't published.
    const captureToken = formData.get('captureToken');
    const { facts, scored } = await fastCheck({
      bytes: original,
      mime: type.mime,
      kind: type.kind,
      userId: user.id,
      captureToken: typeof captureToken === 'string' ? captureToken : null,
    });
    let bytes: Uint8Array = original;
    if (type.kind === 'image') {
      try {
        bytes = await stripImageMetadata(original, type.mime);
      } catch (err) {
        console.warn('upload: could not strip metadata, storing original', err instanceof Error ? err.message : err);
      }
    }
    const integrity = (url: string) =>
      type.kind === 'audio'
        ? Promise.resolve(undefined)
        : saveUploadCheck({ userId: user.id, url, kind: type.kind, mime: type.mime, facts, scored }).then((checkId) => ({ checkId, ...publicSummary(scored) }));

    // Server-chosen name: never reuse the client's file name in the storage path.
    const objectName = `reports/${user.id}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${type.ext}`;

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(objectName, Buffer.from(bytes), {
        access: 'public',
        contentType: type.mime,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      return NextResponse.json({ url: blob.url, kind: type.kind, contentType: type.mime, integrity: await integrity(blob.url) });
    }

    const dataUrl = `data:${type.mime};base64,${Buffer.from(bytes).toString('base64')}`;
    if (dataUrl.length > MAX_DATA_URL_LENGTH) {
      return NextResponse.json(
        { error: 'File too large for local storage. Set BLOB_READ_WRITE_TOKEN for cloud uploads.' },
        { status: 413 }
      );
    }

    return NextResponse.json({ url: dataUrl, fallback: true, kind: type.kind, contentType: type.mime, integrity: await integrity(dataUrl) });
  } catch (error: unknown) {
    return serverError(error, 'upload');
  }
}
