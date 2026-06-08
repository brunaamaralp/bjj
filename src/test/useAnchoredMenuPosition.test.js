import { describe, expect, it } from 'vitest';
import { computeAnchoredMenuStyle } from '../hooks/useAnchoredMenuPosition.js';

describe('computeAnchoredMenuStyle', () => {
  const viewport = { viewportW: 1200, viewportH: 800 };

  it('opens below the trigger when there is room', () => {
    const rect = { top: 120, bottom: 156, left: 400, right: 430, width: 30, height: 36 };
    const style = computeAnchoredMenuStyle(rect, viewport, { maxHeight: 420 });
    expect(style.top).toBe(164);
    expect(style.bottom).toBe('auto');
    expect(style.right).toBe(770);
  });

  it('anchors above the trigger when space below is tight', () => {
    const rect = { top: 714, bottom: 750, left: 400, right: 430, width: 30, height: 36 };
    const style = computeAnchoredMenuStyle(rect, viewport, { maxHeight: 420 });
    expect(style.bottom).toBe(94);
    expect(style.top).toBe('auto');
    expect(style.maxHeight).toBeLessThanOrEqual(420);
  });

  it('does not pin the menu to the top of the viewport when flipping above', () => {
    const rect = { top: 714, bottom: 750, left: 400, right: 430, width: 30, height: 36 };
    const style = computeAnchoredMenuStyle(rect, viewport, { maxHeight: 420 });
    expect(style.top).toBe('auto');
    expect(style.bottom).toBeLessThan(200);
    expect(style.bottom).toBeGreaterThan(80);
  });
});
