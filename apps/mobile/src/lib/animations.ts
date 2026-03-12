import type { WithSpringConfig } from "react-native-reanimated";

// Spring presets - every animation in the app uses one of these
export const springs = {
  /** Button presses, toggles, FAB - fast and crisp */
  snappy: { damping: 15, stiffness: 400, mass: 0.8 } satisfies WithSpringConfig,
  /** Confetti, XP float, celebrations - playful overshoot */
  bouncy: { damping: 12, stiffness: 350, mass: 1.0 } satisfies WithSpringConfig,
  /** Sheet slides, screen transitions, fades - smooth and controlled */
  smooth: { damping: 20, stiffness: 300, mass: 1.0 } satisfies WithSpringConfig,
} as const;

// Timing presets for the rare cases where spring doesn't fit
export const timing = {
  fast: { duration: 150 },
  normal: { duration: 200 },
  slow: { duration: 300 },
} as const;

/**
 * Calculate stagger delay for list item entrance animations.
 * Items beyond maxAnimated appear instantly (no delay).
 */
export function staggerDelay(index: number, delayMs = 40, maxAnimated = 8): number {
  return index < maxAnimated ? index * delayMs : 0;
}
