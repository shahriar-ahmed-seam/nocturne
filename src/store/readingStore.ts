/**
 * readingStore — owns the active reading session, progress persistence,
 * bookmarks, and the virtualized paragraph list state.
 *
 * Persistence strategy:
 *   - MMKV:                 ReaderSettings (instantaneous local writes)
 *   - reading_backup.json:  NovelReadingProgress (debounced, written to SAF)
 *
 * Auto-save policy:
 *   - Debounced 5 s after last position change.
 *   - Immediate flush on app backgrounding (AppState change).
 *   - Immediate flush on chapter transition.
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { castDraft } from 'immer';
import type { NovelId, Chapter } from '../types/library.types';
import type { SafUri } from '../types/saf.types';
import type {
  ReadingPosition,
  Bookmark,
  NovelReadingProgress,
  ReaderSettings,
  TtsState,
  ReadingBackupFile,
} from '../types/state.types';

import { saveBackup } from '../services/BackupService';
import { loadSettings, saveSettings } from '../services/SettingsService';

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export interface ReadingState {
  // ─── Active session ───────────────────────────────────────────────────────
  activeNovelId: NovelId | null;
  activeChapter: Chapter | null;
  /**
   * Flat array of paragraph strings currently loaded into the
   * virtualized list. Populated incrementally by the chunk reader.
   */
  paragraphs: string[];
  /** Index into `paragraphs` that is currently visible on screen. */
  visibleParagraphIndex: number;
  /**
   * True while the chunk reader is fetching the next batch of paragraphs.
   * Drives the "loading more…" footer in the virtualized list.
   */
  isLoadingChunk: boolean;

  // ─── Settings (MMKV-backed) ───────────────────────────────────────────────
  settings: ReaderSettings;

  // ─── TTS ──────────────────────────────────────────────────────────────────
  tts: TtsState;

  // ─── Progress map (SAF-backed) ────────────────────────────────────────────
  /**
   * Keyed by NovelId. This is the in-memory mirror of reading_backup.json.
   * Always write through `persistProgress()` — never mutate directly from UI.
   */
  progressMap: Record<NovelId, NovelReadingProgress>;

  // ─── Backup metadata ─────────────────────────────────────────────────────
  backupUri: SafUri | null;
  isSaving: boolean;
  lastSavedAt: number | null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface ReadingActions {
  // Session management
  openChapter(novelId: NovelId, chapter: Chapter): Promise<void>;
  closeReader(): void;

  // Paragraph / chunk management
  appendParagraphs(newParagraphs: string[]): void;
  setVisibleParagraphIndex(index: number): void;
  setLoadingChunk(loading: boolean): void;

  // Progress
  savePosition(position: ReadingPosition): void;
  persistProgress(): Promise<void>;
  loadProgressFromBackup(backup: ReadingBackupFile): void;

  // Bookmarks
  addBookmark(bookmark: Omit<Bookmark, 'id' | 'createdAt'>): void;
  removeBookmark(bookmarkId: string): void;

  // Settings
  updateSettings(patch: Partial<ReaderSettings>): void;

  // TTS
  setTtsState(patch: Partial<TtsState>): void;
}

export type ReadingStore = ReadingState & ReadingActions;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useReadingStore = create<ReadingStore>()(
  immer((set, _get) => ({
    // ── Initial state ──────────────────────────────────────────────────────
    activeNovelId: null,
    activeChapter: null,
    paragraphs: [],
    visibleParagraphIndex: 0,
    isLoadingChunk: false,
    settings: loadSettings(),
    tts: { status: 'idle', activeParagraphIndex: null, errorMessage: null },
    progressMap: {} as Record<NovelId, NovelReadingProgress>,
    backupUri: null,
    isSaving: false,
    lastSavedAt: null,

    // ── Actions ────────────────────────────────────────────────────────────
    openChapter: async (novelId, chapter) => {
      set((state) => {
        state.activeNovelId = novelId;
        state.activeChapter = chapter;
        state.paragraphs = [];
        state.visibleParagraphIndex = 0;
        state.isLoadingChunk = true;
        state.tts = { status: 'idle', activeParagraphIndex: null, errorMessage: null };
      });
    },

    closeReader: () =>
      set((state) => {
        state.activeNovelId = null;
        state.activeChapter = null;
        state.paragraphs = [];
        state.visibleParagraphIndex = 0;
        state.tts = { status: 'idle', activeParagraphIndex: null, errorMessage: null };
      }),

    appendParagraphs: (newParagraphs) =>
      set((state) => {
        state.paragraphs.push(...newParagraphs);
      }),

    setVisibleParagraphIndex: (index) =>
      set((state) => {
        state.visibleParagraphIndex = index;
      }),

    setLoadingChunk: (loading) =>
      set((state) => {
        state.isLoadingChunk = loading;
      }),

    savePosition: (position) =>
      set((state) => {
        const novelId = state.activeNovelId;
        if (!novelId) return;
        const existing = state.progressMap[novelId];
        state.progressMap[novelId] = castDraft({
          ...(existing ?? {}),
          novelId,
          lastReadChapterFileName: position.chapterFileName,
          lastReadChapterUri: position.chapterUri,
          paragraphIndex: position.paragraphIndex,
          byteOffset: position.byteOffset,
          lastAccessedAt: position.savedAt,
          bookmarks: existing?.bookmarks ?? [],
          completedChapterUris: existing?.completedChapterUris ?? [],
        } as NovelReadingProgress);
      }),

    persistProgress: async () => {
      // Grab a snapshot of what we need outside the immer draft
      const { progressMap, activeNovelId } = _get();
      if (!activeNovelId) return;

      // Dynamic import to avoid circular dependency at module init
      const libraryMod = await import('./libraryStore');
      const treeUri = libraryMod.useLibraryStore.getState().treeUri;
      if (!treeUri) return;

      set((state) => {
        state.isSaving = true;
      });

      try {
        const result = await saveBackup(treeUri, progressMap);
        if (result.ok) {
          set((state) => {
            state.lastSavedAt = Date.now();
          });
        } else {
          console.error('[Backup] Save failed:', result.error.message);
        }
      } catch (e) {
        console.error('[Backup] Unexpected error:', e);
      } finally {
        set((state) => {
          state.isSaving = false;
        });
      }
    },

    loadProgressFromBackup: (backup) =>
      set((state) => {
        state.progressMap = castDraft(backup.progress as Record<NovelId, NovelReadingProgress>);
      }),

    addBookmark: (partial) =>
      set((state) => {
        const novelId = state.activeNovelId;
        if (!novelId || !state.progressMap[novelId]) return;
        const bookmark: Bookmark = {
          ...partial,
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          createdAt: Date.now(),
        };
        state.progressMap[novelId]!.bookmarks.push(bookmark);
      }),

    removeBookmark: (bookmarkId) =>
      set((state) => {
        const novelId = state.activeNovelId;
        if (!novelId || !state.progressMap[novelId]) return;
        const progress = state.progressMap[novelId]!;
        progress.bookmarks = progress.bookmarks.filter((b) => b.id !== bookmarkId);
      }),

    updateSettings: (patch) =>
      set((state) => {
        Object.assign(state.settings, patch);
        // Write-through to MMKV for sub-ms reads on next cold start
        saveSettings({ ...state.settings });
      }),

    setTtsState: (patch) =>
      set((state) => {
        Object.assign(state.tts, patch);
      }),
  })),
);
