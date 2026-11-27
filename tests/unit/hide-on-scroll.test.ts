import { describe, expect, it } from 'vitest';
import { nextNavHidden, SHOW_NEAR_TOP_PX } from '@/lib/hide-on-scroll';

describe('nextNavHidden', () => {
  it('hides when scrolling down past the top', () => {
    expect(nextNavHidden(false, 200, 260)).toBe(true);
  });
  it('shows again when scrolling up', () => {
    expect(nextNavHidden(true, 900, 880)).toBe(false);
  });
  it('always shows near the top', () => {
    expect(nextNavHidden(true, 0, SHOW_NEAR_TOP_PX)).toBe(false);
  });
  it('ignores tiny movements', () => {
    expect(nextNavHidden(true, 500, 497)).toBe(true);
    expect(nextNavHidden(false, 500, 503)).toBe(false);
  });
});
