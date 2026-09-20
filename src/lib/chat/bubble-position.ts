/**
 * Where the chat bubble sits, and how far it may be dragged.
 *
 * Pure so it can be tested: the clamping is the part that matters, because a
 * bubble dragged off the edge of a phone is a bubble nobody gets back.
 */

export interface BubbleOffset {
  /** Pixels from the right edge. */
  right: number;
  /** Pixels from the bottom edge. */
  bottom: number;
}

/**
 * The resting place, before anybody moves it.
 *
 * Clear of the mobile bottom navigation, which is where the bubble was sitting
 * on top of the Account tab, and of the safe-area inset on a phone with a home
 * bar.
 */
export function defaultOffset(viewportWidth: number, hasBottomNav: boolean): BubbleOffset {
  const small = viewportWidth < 640;
  return {
    right: small ? 12 : 24,
    bottom: hasBottomNav && small ? 84 : small ? 20 : 24,
  };
}

/** The bubble's width and height at this viewport. Smaller where space is. */
export function bubbleSize(viewportWidth: number): number {
  // 48 on a phone, 56 above it: below 44 a quarter of taps miss, and a 64px
  // circle on a 360px screen is a sixth of the width.
  return viewportWidth < 640 ? 48 : 56;
}

/**
 * Keep a dragged bubble on screen.
 *
 * Clamped against the viewport rather than the document, and with a margin so
 * it never ends up half under a rounded corner.
 */
export function clampOffset(
  offset: BubbleOffset,
  viewport: { width: number; height: number },
  size: number,
): BubbleOffset {
  const margin = 8;
  const maxRight = Math.max(margin, viewport.width - size - margin);
  const maxBottom = Math.max(margin, viewport.height - size - margin);
  return {
    right: Math.min(Math.max(margin, offset.right), maxRight),
    bottom: Math.min(Math.max(margin, offset.bottom), maxBottom),
  };
}

/**
 * Which side the panel opens from.
 *
 * A panel anchored to the right of a bubble the user has dragged to the left
 * edge would open off screen, so the side follows the bubble.
 */
export function panelSide(offset: BubbleOffset, viewportWidth: number): "left" | "right" {
  return offset.right > viewportWidth / 2 ? "left" : "right";
}
