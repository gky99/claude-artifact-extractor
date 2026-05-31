import { describe, it, expect } from 'vitest';
import { clampToViewport } from '../src/draggable';

const size = { width: 100, height: 40 };
const viewport = { width: 1000, height: 800 };

describe('clampToViewport', () => {
  it('leaves an in-bounds position unchanged', () => {
    expect(clampToViewport({ x: 200, y: 300 }, size, viewport)).toEqual({ x: 200, y: 300 });
  });

  it('clamps a negative position to the top-left edge', () => {
    expect(clampToViewport({ x: -50, y: -20 }, size, viewport)).toEqual({ x: 0, y: 0 });
  });

  it('clamps an over-far position to the bottom-right edge', () => {
    expect(clampToViewport({ x: 5000, y: 5000 }, size, viewport)).toEqual({ x: 900, y: 760 });
  });

  it('clamps to 0 when the element is larger than the viewport', () => {
    expect(clampToViewport({ x: 10, y: 10 }, { width: 1200, height: 900 }, viewport)).toEqual({ x: 0, y: 0 });
  });
});
