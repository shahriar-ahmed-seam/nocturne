/**
 * Theme color palettes for all four reader themes + the app chrome.
 *
 * Each palette provides both "chrome" colours (navigation bars, cards,
 * backgrounds) and "reader" colours (text surface and foreground used
 * inside the immersive reading view).
 */

import type { ReaderTheme } from '../types/state.types';

// ---------------------------------------------------------------------------
// Palette type
// ---------------------------------------------------------------------------

export interface ThemePalette {
  // ── Chrome (app shell) ──────────────────────────────────────────────────
  /** Primary background (screens, modals). */
  background: string;
  /** Elevated surface (cards, bottom sheets). */
  surface: string;
  /** Glassmorphism card overlay. */
  surfaceGlass: string;
  /** Primary text colour. */
  text: string;
  /** Muted / secondary text. */
  textSecondary: string;
  /** Accent / CTA colour. */
  accent: string;
  /** Accent on-colour (text on accent bg). */
  onAccent: string;
  /** Dividers and borders. */
  border: string;
  /** Status bar style. */
  statusBar: 'light-content' | 'dark-content';

  // ── Reader surface ──────────────────────────────────────────────────────
  readerBg: string;
  readerText: string;
  readerHighlight: string;
}

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------

const LIGHT: ThemePalette = {
  background: '#F5F5F7',
  surface: '#FFFFFF',
  surfaceGlass: 'rgba(255,255,255,0.72)',
  text: '#1C1C1E',
  textSecondary: '#8E8E93',
  accent: '#5856D6',
  onAccent: '#FFFFFF',
  border: '#E5E5EA',
  statusBar: 'dark-content',
  readerBg: '#FFFFFF',
  readerText: '#1C1C1E',
  readerHighlight: 'rgba(88,86,214,0.18)',
};

const DARK: ThemePalette = {
  background: '#0A0A0C',
  surface: '#1C1C1E',
  surfaceGlass: 'rgba(28,28,30,0.78)',
  text: '#E5E5EA',
  textSecondary: '#8E8E93',
  accent: '#7B78F2',
  onAccent: '#FFFFFF',
  border: '#2C2C2E',
  statusBar: 'light-content',
  readerBg: '#1C1C1E',
  readerText: '#E5E5EA',
  readerHighlight: 'rgba(123,120,242,0.22)',
};

const SEPIA: ThemePalette = {
  background: '#F4ECD8',
  surface: '#FAF5E8',
  surfaceGlass: 'rgba(250,245,232,0.75)',
  text: '#3B2F1E',
  textSecondary: '#8B7D6B',
  accent: '#A0522D',
  onAccent: '#FFFFFF',
  border: '#DDD4BE',
  statusBar: 'dark-content',
  readerBg: '#FAF5E8',
  readerText: '#3B2F1E',
  readerHighlight: 'rgba(160,82,45,0.16)',
};

const AMOLED: ThemePalette = {
  background: '#000000',
  surface: '#0A0A0A',
  surfaceGlass: 'rgba(10,10,10,0.82)',
  text: '#D4D4D4',
  textSecondary: '#6B6B6B',
  accent: '#BB86FC',
  onAccent: '#000000',
  border: '#1A1A1A',
  statusBar: 'light-content',
  readerBg: '#000000',
  readerText: '#D4D4D4',
  readerHighlight: 'rgba(187,134,252,0.20)',
};

// ---------------------------------------------------------------------------
// Palette map
// ---------------------------------------------------------------------------

export const PALETTES: Readonly<Record<ReaderTheme, ThemePalette>> = {
  light: LIGHT,
  dark: DARK,
  sepia: SEPIA,
  amoled: AMOLED,
};

/** Get the palette for a given theme key. */
export const getPalette = (theme: ReaderTheme): ThemePalette => PALETTES[theme];

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const RADIUS = {
  sm: 6,
  md: 12,
  lg: 20,
  xl: 28,
} as const;

export const COVER_ASPECT_RATIO = 2 / 3; // width / height (standard book cover)
export const GRID_COLUMNS = 3;
export const GRID_GAP = SPACING.sm;

// ---------------------------------------------------------------------------
// Reading typefaces
// ---------------------------------------------------------------------------

import type { ReaderFontFamily } from '../types/state.types';

/**
 * Maps a `ReaderFontFamily` to a concrete platform font.
 * `undefined` uses the system default. The serif/sans/mono families resolve
 * to fonts that ship with Android so no custom font bundling is required.
 */
export const FONT_FAMILY_MAP: Readonly<Record<ReaderFontFamily, string | undefined>> = {
  system: undefined,
  serif: 'serif',
  sans: 'sans-serif',
  mono: 'monospace',
};

export const FONT_FAMILY_LABELS: Readonly<Record<ReaderFontFamily, string>> = {
  system: 'System',
  serif: 'Serif',
  sans: 'Sans',
  mono: 'Mono',
};
