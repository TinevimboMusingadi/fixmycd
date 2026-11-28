import { describe, expect, it } from 'vitest';
import { GET as getReport } from '@/app/api/reports/[id]/route';
import { POST as createReportRoute } from '@/app/api/reports/route';
import { POST as postComment } from '@/app/api/reports/[id]/comments/route';
import { POST as flagRoute } from '@/app/api/reports/[id]/flag/route';
import { PATCH as patchUser } from '@/app/api/admin/users/route';
import { POST as createShare } from '@/app/api/admin/analytics/shares/route';
import { GET as publicAnalytics } from '@/app/api/public/analytics/[token]/[endpoint]/route';
import { call } from '../helpers/route';
import { cookieJar } from '../helpers/cookie-jar';
import { createReport, createUser } from '../helpers/factories';
import { signedInUser } from '../helpers/session';

describe('security hardening', () => {
  it('shows a review note only to the submitter and moderators', async () => {
    const owner = await createUser();
    const report = await createReport(owner.id, { reviewNote: 'Please add a closer photo' });
    const read = () => call(getReport, { params: { id: report.id } });

    cookieJar.clear();
    expect((await read()).json.reviewNote).toBeNull();
    await signedInUser('submitter');
    expect((await read()).json.reviewNote).toBeNull();
    await signedInUser('referee');
    expect((await read()).json.reviewNote).toBe('Please add a closer photo');
  });

  it('keeps viewer accounts read-only', async () => {
    const owner = await createUser();
    const report = await createReport(owner.id);
    await signedInUser('viewer');
    expect((await call(createReportRoute, { method: 'POST', body: {} })).status).toBe(403);
    expect((await call(postComment, { method: 'POST', params: { id: report.id }, body: { body: 'hi' } })).status).toBe(403);
  });

  it('only a super_admin can make someone an admin', async () => {
    const target = await createUser({ role: 'submitter' });
    await signedInUser('admin');
    expect((await call(patchUser, { method: 'PATCH', body: { userId: target.id, role: 'admin' } })).status).toBe(403);
    await signedInUser('super_admin');
    expect((await call(patchUser, { method: 'PATCH', body: { userId: target.id, role: 'admin' } })).status).toBe(200);
  });

  it('treats hidden posts as missing when flagging', async () => {
    const owner = await createUser();
    const hidden = await createReport(owner.id, { isHidden: true });
    await signedInUser('submitter');
    const res = await call(flagRoute, { method: 'POST', params: { id: hidden.id }, body: { targetType: 'report', reason: 'spam' } });
    expect(res.status).toBe(404);
  });

  it('never groups public dashboards by reporter', async () => {
    const author = await createUser({ displayName: 'Secret Person' });
    await createReport(author.id);
    await signedInUser('admin');
    const { json: share } = await call(createShare, { method: 'POST', body: { filters: {} } });
    cookieJar.clear();
    const res = await call(publicAnalytics, { path: '/x', params: { token: share.token, endpoint: 'breakdowns' }, query: { groupBy: 'reporter' } });
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Secret Person');
    expect(res.text).not.toContain(author.id);
  });
});
