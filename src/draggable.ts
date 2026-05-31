export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Clamps a top-left point so an element of `size` stays fully inside `viewport`.
 *  If the element is larger than the viewport on an axis, that axis pins to 0. */
export function clampToViewport(pos: Point, size: Size, viewport: Size): Point {
  const maxX = Math.max(0, viewport.width - size.width);
  const maxY = Math.max(0, viewport.height - size.height);
  return {
    x: Math.min(Math.max(0, pos.x), maxX),
    y: Math.min(Math.max(0, pos.y), maxY),
  };
}

export interface DraggableOptions {
  /** Pixels of movement before a press is treated as a drag (not a click). */
  threshold?: number;
  /** Called once on pointerup after a real drag, with the element's new top-left. */
  onDrop: (pos: Point) => void;
}

/** Makes `el` draggable by pointer. While dragging it switches `el` to
 *  left/top positioning. A press that moves less than `threshold` is left to
 *  behave as a normal click; a real drag suppresses the trailing click so inner
 *  buttons don't fire. */
export function makeDraggable(el: HTMLElement, { threshold = 4, onDrop }: DraggableOptions): void {
  let startX = 0;
  let startY = 0;
  let originLeft = 0;
  let originTop = 0;
  let dragging = false;
  let moved = false;

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    const rect = el.getBoundingClientRect();
    originLeft = rect.left;
    originTop = rect.top;
    el.setPointerCapture(e.pointerId);
  });

  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!moved && Math.hypot(dx, dy) < threshold) return;
    moved = true;
    el.style.left = `${originLeft + dx}px`;
    el.style.top = `${originTop + dy}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  });

  el.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    el.releasePointerCapture(e.pointerId);
    if (moved) {
      const rect = el.getBoundingClientRect();
      onDrop({ x: rect.left, y: rect.top });
    }
  });

  // Capture-phase: cancel the click that the browser fires after a drag,
  // so the Artifacts/gear button underneath doesn't activate.
  el.addEventListener(
    'click',
    (e) => {
      if (moved) {
        e.stopPropagation();
        e.preventDefault();
        moved = false;
      }
    },
    true,
  );
}
