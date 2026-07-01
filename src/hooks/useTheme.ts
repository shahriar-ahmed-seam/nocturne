/**
 * useTheme — convenience hook to get the current ThemePalette
 * derived from the reader settings in the Zustand store.
 */

import { useMemo } from 'react';
import { useReadingStore } from '../store/readingStore';
import { getPalette } from '../theme/colors';
import type { ThemePalette } from '../theme/colors';

export function useTheme(): ThemePalette {
  const theme = useReadingStore((s) => s.settings.theme);
  return useMemo(() => getPalette(theme), [theme]);
}
