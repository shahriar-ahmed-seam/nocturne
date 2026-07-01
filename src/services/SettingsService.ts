/**
 * SettingsService — MMKV-backed persistence for ReaderSettings.
 *
 * ReaderSettings are stored in MMKV (not in the SAF backup) because:
 *   1. They're device-specific (DPI, accessibility preferences)
 *   2. They need sub-millisecond reads on every render
 *   3. They don't need to travel between devices
 *
 * The Zustand readingStore initializes its `settings` from MMKV on boot.
 * Every `updateSettings()` call writes through to MMKV.
 */

import { MMKV } from 'react-native-mmkv';
import type { ReaderSettings } from '../types/state.types';
import { DEFAULT_READER_SETTINGS } from '../types/state.types';

// ---------------------------------------------------------------------------
// MMKV instance
// ---------------------------------------------------------------------------

const storage = new MMKV({ id: 'novel-reader-settings' });

const KEY_SETTINGS = 'reader_settings';
const KEY_TREE_URI = 'library_tree_uri';
const KEY_ONBOARDED = 'has_seen_onboarding';

// ---------------------------------------------------------------------------
// ReaderSettings
// ---------------------------------------------------------------------------

export function loadSettings(): ReaderSettings {
  try {
    const raw = storage.getString(KEY_SETTINGS);
    if (!raw) return { ...DEFAULT_READER_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<ReaderSettings>;
    return { ...DEFAULT_READER_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_READER_SETTINGS };
  }
}

export function saveSettings(settings: ReaderSettings): void {
  storage.set(KEY_SETTINGS, JSON.stringify(settings));
}

// ---------------------------------------------------------------------------
// Tree URI (persist across cold starts)
// ---------------------------------------------------------------------------

export function loadTreeUri(): string | null {
  return storage.getString(KEY_TREE_URI) ?? null;
}

export function saveTreeUri(uri: string): void {
  storage.set(KEY_TREE_URI, uri);
}

export function clearTreeUri(): void {
  storage.delete(KEY_TREE_URI);
}

// ---------------------------------------------------------------------------
// Onboarding (first-run experience)
// ---------------------------------------------------------------------------

export function hasSeenOnboarding(): boolean {
  return storage.getBoolean(KEY_ONBOARDED) ?? false;
}

export function markOnboardingSeen(): void {
  storage.set(KEY_ONBOARDED, true);
}
