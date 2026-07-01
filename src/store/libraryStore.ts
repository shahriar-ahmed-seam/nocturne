/**
 * libraryStore — owns library scanning, novel indexing, and filter state.
 *
 * Backed by Zustand with Immer middleware for structural sharing.
 * The SAF storage service is injected at runtime (never imported directly)
 * to maintain testability.
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { subscribeWithSelector } from 'zustand/middleware';
import { castDraft } from 'immer';
import type {
  Library,
  LibraryFilter,
  Novel,
  NovelId,
  LibrarySortKey,
} from '../types/library.types';
import type { SafUri } from '../types/saf.types';

import { SafStorageService } from '../storage/SafStorageService';
import { scanLibraryTree } from '../services/LibraryScanService';
import { loadBackup } from '../services/BackupService';
import { loadTreeUri, saveTreeUri } from '../services/SettingsService';

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export interface LibraryState {
  // ─── Persisted ────────────────────────────────────────────────────────────
  /** The root tree URI. Null until user grants access. */
  treeUri: SafUri | null;

  // ─── Derived / cached ─────────────────────────────────────────────────────
  library: Library | null;

  // ─── UI state ─────────────────────────────────────────────────────────────
  filter: LibraryFilter;
  isInitializing: boolean;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface LibraryActions {
  /** Step 2: Launches ACTION_OPEN_DOCUMENT_TREE, persists permission. */
  requestLibraryAccess(): Promise<void>;

  /**
   * Non-blocking background scan. Updates `library` incrementally via
   * `setNovel` so the UI can start rendering before the scan finishes.
   */
  scanLibrary(): Promise<void>;

  /** Called by the background scanner for each discovered novel. */
  upsertNovel(novel: Novel): void;

  setTreeUri(uri: SafUri): void;
  setFilter(patch: Partial<LibraryFilter>): void;
  setSortBy(sortBy: LibrarySortKey): void;
  setSearchQuery(query: string): void;
  setScanning(isScanning: boolean): void;
}

export type LibraryStore = LibraryState & LibraryActions;

// ---------------------------------------------------------------------------
// Store factory
// ---------------------------------------------------------------------------

export const useLibraryStore = create<LibraryStore>()(
  subscribeWithSelector(
    immer((set, _get) => ({
      // ── Initial state ──────────────────────────────────────────────────────
      // Restore treeUri from MMKV; if present also pre-initialize the library
      // skeleton so scanLibrary() and upsertNovel() can run without waiting
      // for requestLibraryAccess() to be called again.
      treeUri: loadTreeUri() as SafUri | null,
      library: (() => {
        const uri = loadTreeUri();
        if (!uri) return null;
        return {
          treeUri: uri as SafUri,
          novels: {} as Record<NovelId, Novel>,
          novelOrder: [] as unknown as ReadonlyArray<NovelId>,
          lastScannedAt: null,
          isScanning: false,
        };
      })(),
      filter: { sortBy: 'recentlyRead', searchQuery: '' },
      isInitializing: false,

      // ── Actions ─────────────────────────────────────────────────────────────
      requestLibraryAccess: async () => {
        const saf = SafStorageService.getInstance();
        const result = await saf.requestLibraryPermission();

        if (!result.ok) {
          console.error('[Library] Permission denied:', result.error.message);
          return;
        }

        const { treeUri } = result.value;

        // Persist to MMKV for cold-start restoration
        saveTreeUri(treeUri as string);

        set((state) => {
          state.treeUri = treeUri;
          state.library = {
            treeUri,
            novels: {},
            novelOrder: [],
            lastScannedAt: null,
            isScanning: false,
          };
          state.isInitializing = false;
        });

        // Load reading progress backup from SAF root
        const backupResult = await loadBackup(treeUri);
        if (backupResult.ok) {
          // Dynamic import to avoid circular dependency at module init
          const readingMod = await import('./readingStore');
          readingMod.useReadingStore.getState().loadProgressFromBackup(backupResult.value);
        }
      },

      scanLibrary: async () => {
        const { treeUri, library } = _get();
        if (!treeUri || !library) return;

        set((state) => {
          if (state.library) state.library.isScanning = true;
        });

        try {
          await scanLibraryTree(treeUri, (novel) => {
            // Incremental upsert so UI updates as each novel is discovered
            set((state) => {
              if (!state.library) return;
              (state.library.novels as Record<NovelId, Novel>)[novel.id] = novel;
              if (!state.library.novelOrder.includes(novel.id)) {
                (state.library.novelOrder as NovelId[]).push(novel.id);
              }
            });
          });
        } catch (e) {
          console.error('[Library] scanLibrary failed:', e);
        } finally {
          set((state) => {
            if (state.library) {
              state.library.isScanning = false;
              state.library.lastScannedAt = Date.now();
            }
          });
        }
      },

      upsertNovel: (novel) =>
        set((state) => {
          if (!state.library) return;
          state.library.novels[novel.id as NovelId] = castDraft(novel);
          if (!state.library.novelOrder.includes(novel.id as NovelId)) {
            (state.library.novelOrder as NovelId[]).push(novel.id as NovelId);
          }
        }),

      setTreeUri: (uri) =>
        set((state) => {
          state.treeUri = uri;
        }),

      setFilter: (patch) =>
        set((state) => {
          Object.assign(state.filter, patch);
        }),

      setSortBy: (sortBy) =>
        set((state) => {
          state.filter.sortBy = sortBy;
        }),

      setSearchQuery: (query) =>
        set((state) => {
          state.filter.searchQuery = query;
        }),

      setScanning: (isScanning) =>
        set((state) => {
          if (state.library) {
            state.library.isScanning = isScanning;
          }
        }),
    })),
  ),
);
