import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { distanceKm, matchGenerator, scoreSignals, sourceTypeKind, worstVerdict } from '@/lib/media-integrity/score';
import { contextSignals, photoSignals, pngTextChunks, readPhotoFacts } from '@/lib/media-integrity/metadata';
import { c2paSignals, readC2pa } from '@/lib/media-integrity/c2pa';
import { issueCaptureToken, verifyCaptureToken } from '@/lib/media-integrity/capture';
import { stripImageMetadata } from '@/lib/media-integrity/strip';

const fixture = (name: string) => new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../fixtures', name)));

describe('scoring', () => {
  it('needs hard proof to confirm and clear evidence to suspect', () => {
    expect(scoreSignals([]).verdict).toBe('unverified');
    expect(scoreSignals([{ id: 'a', weight: 100, conclusive: true, reason: 'x' }]).verdict).toBe('ai_confirmed');
    expect(scoreSignals([{ id: 'a', weight: 15, reason: 'size' }]).verdict).toBe('unverified');
    expect(scoreSignals([{ id: 'a', weight: 45, reason: 'tool' }]).verdict).toBe('suspected_ai');
    expect(scoreSignals([{ id: 'a', weight: -25, reason: 'camera' }]).verdict).toBe('likely_authentic');
  });
  it('never lets a weak detector confirm on its own', () => {
    expect(scoreSignals([{ id: 'deep.gemini', weight: 25, reason: 'x' }]).verdict).toBe('unverified');
  });
  it('picks the worst verdict of a post', () => {
    expect(worstVerdict(['likely_authentic', 'suspected_ai', null])).toBe('suspected_ai');
    expect(worstVerdict([])).toBeNull();
  });
  it('recognises AI tools and IPTC source types', () => {
    expect(matchGenerator('Adobe Photoshop 25.0')).toBeNull();
    expect(matchGenerator('Midjourney v7')).toBe('Midjourney');
    expect(matchGenerator('DALL·E 3')).toMatch(/OpenAI/);
    expect(sourceTypeKind('http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia')).toBe('ai');
    expect(sourceTypeKind('digitalCapture')).toBe('capture');
    expect(distanceKm({ lat: 40.7128, lng: -74.006 }, { lat: 40.7306, lng: -73.9352 })).toBeCloseTo(6.3, 0);
  });
});

describe('evidence readers', () => {
  it('reads AI Content Credentials (C2PA) as conclusive', async () => {
    const c = await readC2pa(fixture('ai-content-credentials.jpg'), 'image/jpeg');
    expect(c).toMatchObject({ present: true, aiSource: true });
    expect(scoreSignals(c2paSignals(c)).verdict).toBe('ai_confirmed');
  });
  it('finds a Stable Diffusion generation record in a PNG', async () => {
    const bytes = fixture('stable-diffusion.png');
    expect(pngTextChunks(bytes).parameters).toMatch(/Steps: 30/);
    const facts = await readPhotoFacts(bytes, 'image/png');
    expect(facts.diffusionParameters).toBe(true);
    expect(scoreSignals(photoSignals(facts)).verdict).toBe('ai_confirmed');
  });
  it('reads camera metadata and checks it against the post', async () => {
    const facts = await readPhotoFacts(fixture('camera-photo.jpg'), 'image/jpeg');
    expect(facts).toMatchObject({ make: 'Google', model: 'Pixel 8' });
    expect(facts.gps?.lat).toBeCloseTo(40.716, 2);
    const near = contextSignals(facts, { lat: 40.7128, lng: -74.006, occurredAt: new Date('2026-11-20T10:00:00Z') });
    expect(near.map((s) => s.id)).toEqual(['ctx.gps_match']);
    const far = contextSignals(facts, { lat: 34.05, lng: -118.24, occurredAt: new Date('2025-01-01T00:00:00Z') });
    expect(far.map((s) => s.id).sort()).toEqual(['ctx.date_far', 'ctx.gps_far']);
    expect(scoreSignals([...photoSignals(facts), ...near]).verdict).toBe('likely_authentic');
  });
  it('a plain photo has no credentials and stays unverified', async () => {
    const c = await readC2pa(fixture('photo-with-gps.jpg'), 'image/jpeg');
    expect(c.present).toBe(false);
  });
});

describe('metadata stripping', () => {
  it('removes EXIF and GPS before storage', async () => {
    const stripped = await stripImageMetadata(fixture('camera-photo.jpg'), 'image/jpeg');
    const facts = await readPhotoFacts(stripped, 'image/jpeg');
    expect(facts.make).toBeUndefined();
    expect(facts.gps).toBeUndefined();
    expect(facts.width).toBe(640);
  });
});

describe('in-app capture tokens', () => {
  it('verify only for the same user within 15 minutes', () => {
    const t = issueCaptureToken('u1', 1_000_000);
    expect(verifyCaptureToken(t, 'u1', 1_000_000 + 60_000)).toBe(true);
    expect(verifyCaptureToken(t, 'u2', 1_000_000 + 60_000)).toBe(false);
    expect(verifyCaptureToken(t, 'u1', 1_000_000 + 16 * 60_000)).toBe(false);
    expect(verifyCaptureToken(t.slice(0, -2) + 'xx', 'u1', 1_000_000)).toBe(false);
    expect(verifyCaptureToken('garbage', 'u1')).toBe(false);
  });
});
