import { NextResponse } from 'next/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';
import { isAuthError, isSuperAdmin, requireAdmin } from '@/lib/auth';

const ASSIGNABLE_BY_ADMIN = ['submitter', 'viewer', 'referee', 'admin'] as const;
const ASSIGNABLE_BY_SUPER = [...ASSIGNABLE_BY_ADMIN, 'super_admin'] as const;
const VALID_STATUSES = ['pending', 'approved', 'rejected'] as const;

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin();
    if (isAuthError(admin)) return admin;

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');

    const allUsers = statusFilter
      ? await db
          .select({
            id: users.id,
            email: users.email,
            displayName: users.displayName,
            role: users.role,
            status: users.status,
            disabledAt: users.disabledAt,
            isSynthetic: users.isSynthetic,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(eq(users.status, statusFilter))
          .orderBy(desc(users.createdAt))
      : await db
          .select({
            id: users.id,
            email: users.email,
            displayName: users.displayName,
            role: users.role,
            status: users.status,
            disabledAt: users.disabledAt,
            isSynthetic: users.isSynthetic,
            createdAt: users.createdAt,
          })
          .from(users)
          .orderBy(desc(users.createdAt));

    return NextResponse.json(
      allUsers.map((u) => ({
        ...u,
        createdAt: u.createdAt.toISOString(),
        disabledAt: u.disabledAt?.toISOString() ?? null,
      }))
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch users';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    if (isAuthError(admin)) return admin;

    const body = await request.json();
    const { userId, disabled, role, status } = body as {
      userId?: string;
      disabled?: boolean;
      role?: string;
      status?: string;
    };

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    const patch: { disabledAt?: Date | null; role?: string; status?: string } = {};
    if (typeof disabled === 'boolean') {
      patch.disabledAt = disabled ? new Date() : null;
    }
    if (role != null) {
      const allowed = isSuperAdmin(admin.role) ? ASSIGNABLE_BY_SUPER : ASSIGNABLE_BY_ADMIN;
      if (!allowed.includes(role as (typeof ASSIGNABLE_BY_ADMIN)[number])) {
        return NextResponse.json({ error: 'Cannot assign that role' }, { status: 403 });
      }
      if (role === 'super_admin' && !isSuperAdmin(admin.role)) {
        return NextResponse.json(
          { error: 'Only super_admin can promote to super_admin' },
          { status: 403 }
        );
      }
      patch.role = role;
    }
    if (status != null) {
      if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      patch.status = status;
    }

    const updated = await db.update(users).set(patch).where(eq(users.id, userId)).returning();
    return NextResponse.json(updated[0]);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update user';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}