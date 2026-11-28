import { NextResponse } from 'next/server';
import { canContribute, getSessionUser, readOnlyAccount } from '@/lib/auth';
import { issueCaptureToken } from '@/lib/media-integrity/capture';
import { serverError } from '@/lib/http';

/** Issued when the app's own camera/recorder opens; sent back with the upload (see media-integrity/capture). */
export async function POST() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canContribute(user.role)) return readOnlyAccount();
    return NextResponse.json({ token: issueCaptureToken(user.id) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    return serverError(error, 'capture-token');
  }
}
