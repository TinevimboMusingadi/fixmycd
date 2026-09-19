import { NextResponse } from 'next/server';
import { db } from '@/db';
import { betaSubscribers } from '@/db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }

    const existing = await db
      .select()
      .from(betaSubscribers)
      .where(eq(betaSubscribers.email, email))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({ success: true, message: 'Already subscribed' });
    }

    await db.insert(betaSubscribers).values({
      id: crypto.randomUUID(),
      email,
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true, message: 'Subscribed' }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to subscribe';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}