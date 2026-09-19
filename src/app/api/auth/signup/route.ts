import { NextResponse } from 'next/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, displayName } = body;

    if (!email || !password || !displayName) {
      return NextResponse.json(
        { error: 'Email, password, and display name are required' },
        { status: 400 }
      );
    }

    const existingUsers = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existingUsers.length > 0) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      );
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const userId = crypto.randomUUID();

    await db.insert(users).values({
      id: userId,
      email,
      displayName,
      passwordHash,
      role: 'submitter',
      status: 'pending',
      createdAt: new Date(),
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Your account is pending approval. You will be notified once approved.',
        user: { id: userId, email, displayName },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Signup failed';
    console.error('Signup error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}