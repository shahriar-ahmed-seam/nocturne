/**
 * Reading state, bookmarks, and the root backup schema.
 *
 * This module defines the EXACT shape of `reading_backup.json` that is
 * persisted to the root of the user's SAF library folder, as well as the
 * in-memory runtime state managed by Zustand.
 */

import type { SafUri } from './saf.types';
import type { NovelId } from './library.types';

// ---------------------------------------------------------------------------
// Reading position
// ---------------------------------------------------------------------------

/**
 * A precise, layout-agnostic reading position.
 *
 * We persist BOTH `paragraphIndex` and `byteOffset` so that:
 *   - `byteOffset` is used as the seek point for the chunk reader.
 *   - `paragraphIndex` is used as the scroll target for the virtualized list.
 *
 * On font-size change or screen rotation, only `paragraphIndex` matters
 * (the renderer re-flows text); on a fresh install or device change,
 * `byteOffset` is the reliable fallback.
 */
export interface ReadingPosition {
  /** content:// URI of the chapter .txt file. */
  readonly chapterUri: SafUri;
  /** Filename e.g. "Chapter 1 {title}.txt" — human-readable fallback. */
  readonly chapterFileName: string;
  /** 0-based index into the paragraph array rendered by the virtualized list. */
  readonly paragraphIndex: number;
  /** Byte offset from the start of the file where this paragraph begins. */
  readonly byteOffset: number;
  /** Epoch ms this position was saved. */
  readonly savedAt: number;
}

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------

export interface Bookmark {
  /** Stable UUID for this bookmark entry. */
  readonly id: string;
  readonly chapterUri: SafUri;
  readonly chapterFileName: string;
  readonly paragraphIndex: number;
  /** First ~120 chars of the paragraph for contextual display. */
  readonly snippet: string;
  readonly createdAt: number;
}

// ---------------------------------------------------------------------------
// Per-Novel reading progress (persisted in reading_backup.json)
// ---------------------------------------------------------------------------

export interface NovelReadingProgress {
  readonly novelId: NovelId;
  /** The last chapter whose progress was saved. */
  readonly lastReadChapterFileName: string;
  readonly lastReadChapterUri: SafUri;
  readonly paragraphIndex: number;
  readonly byteOffset: number;
  readonly lastAccessedAt: number;
  readonly bookmarks: ReadonlyArray<Bookmark>;
  /**
   * Set of chapter URIs the user has fully read.
   * Used to grey-out chapters in the chapter list.
   */
  readonly completedChapterUris: ReadonlyArray<SafUri>;
}

// ---------------------------------------------------------------------------
// Root backup schema  →  reading_backup.json
// ---------------------------------------------------------------------------

/**
 * The canonical on-disk format written to the SAF library root.
 * All timestamps are Unix epoch seconds (not milliseconds) for portability.
 */
export interface ReadingBackupFile {
  readonly version: 1;
  /** ISO-8601 string, updated on every save. */
  readonly lastUpdated: string;
  /**
   * Progress records keyed by NovelId.
   * Using a record (not an array) for O(1) lookups without scanning.
   */
  readonly progress: Readonly<Record<NovelId, NovelReadingProgress>>;
}

// ---------------------------------------------------------------------------
// Reader Settings (persisted in MMKV, NOT in the backup JSON)
// ---------------------------------------------------------------------------

export type ReaderTheme = 'light' | 'dark' | 'sepia' | 'amoled';

/** Selectable reading typefaces. Mapped to concrete font stacks in theme/. */
export type ReaderFontFamily = 'system' | 'serif' | 'sans' | 'mono';

export interface ReaderSettings {
  theme: ReaderTheme;
  fontFamily: ReaderFontFamily;
  fontSize: number; // pt, range: [12, 32]
  lineHeight: number; // multiplier, range: [1.2, 2.5]
  paragraphSpacing: number; // px, range: [0, 32]
  /** Screen dimming applied as a reader overlay. range: [0.3, 1.0] (1 = full). */
  brightness: number;
  /** Auto-scroll speed in device pixels per second. range: [10, 160]. */
  autoScrollSpeed: number;
  ttsSpeed: number; // range: [0.5, 3.0]
  ttsPitch: number; // range: [0.5, 2.0]
  ttsVoiceId: string | null;
}

export const DEFAULT_READER_SETTINGS: Readonly<ReaderSettings> = {
  theme: 'dark',
  fontFamily: 'serif',
  fontSize: 17,
  lineHeight: 1.7,
  paragraphSpacing: 12,
  brightness: 1.0,
  autoScrollSpeed: 45,
  ttsSpeed: 1.0,
  ttsPitch: 1.0,
  ttsVoiceId: null,
};

// ---------------------------------------------------------------------------
// TTS runtime state (in-memory only, never persisted)
// ---------------------------------------------------------------------------

export type TtsStatus = 'idle' | 'playing' | 'paused' | 'loading' | 'error';

export interface TtsState {
  status: TtsStatus;
  /** Index of the paragraph currently being spoken. */
  activeParagraphIndex: number | null;
  errorMessage: string | null;
}
