/**
 * Bundled image assets.
 *
 * Onboarding hero photography is sourced from Unsplash (see CREDITS.md in this
 * folder for attribution). Images are pre-optimised (~1400px wide) to keep the
 * APK small while remaining crisp on high-DPI displays.
 */

export const ONBOARDING_IMAGES = {
  lights: require('./onboarding/hero-lights.jpg'),
  stars: require('./onboarding/hero-stars.jpg'),
  library: require('./onboarding/hero-library.jpg'),
} as const;

export type OnboardingImageKey = keyof typeof ONBOARDING_IMAGES;
