/**
 * Library domain types — Novels, Chapters, and metadata parsed from
 * the user's SAF library directory.
 *
 * Directory contract (enforced by the SAF scanner):
 *
 *   [Library_Tree_URI]/
 *   └── [Novel_Title]/
 *       ├── chapters/
 *       │   ├── Chapter 1 {title}.txt
 *       │   └── Chapter 2 {title}.txt
 *       ├── description.txt
 *       └── cover.jpg
 */

import type { SafUri } from './saf.types';

// ---------------------------------------------------------------------------
// Chapter
// ---------------------------------------------------------------------------

export interface Chapter {
  /**
   * Stable ID derived from the file's content:// URI.
   * Used as dictionary key in ReadingProgress maps.
   */
  readonly id: string;
  /** Display name parsed from the filename, e.g. "Chapter 1 — The Beginning". */
  readonly title: string;
  /** SAF content:// URI of the .txt file. */
  readonly uri: SafUri;
  /** Filename as returned by DocumentFile.name. */
  readonly fileName: string;
  /** 1-based chapter index, sorted by fileName lexicographically. */
  readonly index: number;
  /** File size in bytes. Used to pre-calculate total chunk count. */
  readonly sizeBytes: number;
}

// ---------------------------------------------------------------------------
// Novel
// ---------------------------------------------------------------------------

export type NovelId = string & { readonly __brand: 'NovelId' };

export interface Novel {
  /**
   * Stable, URL-safe ID derived from slugifying the folder display name.
   * e.g. "The Beginning After the End" → "the-beginning-after-the-end"
   */
  readonly id: NovelId;
  /** Display title (the folder name). */
  readonly title: string;
  /** SAF URI of the root novel folder (not the chapters/ sub-folder). */
  readonly folderUri: SafUri;
  /** SAF URI of the chapters/ sub-directory. */
  readonly chaptersUri: SafUri;
  /** SAF URI of cover.jpg, or null if not present. */
  readonly coverUri: SafUri | null;
  /** Full text of description.txt, or null if not present. */
  readonly description: string | null;
  /** Ordered chapter list. */
  readonly chapters: ReadonlyArray<Chapter>;
  /** Convenience accessor. */
  readonly totalChapters: number;
  /** Epoch ms of when the SAF scanner last indexed this novel. */
  readonly scannedAt: number;
}

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

export interface Library {
  /** The root tree URI the user granted access to. */
  readonly treeUri: SafUri;
  /** All indexed novels, keyed by NovelId. */
  readonly novels: Readonly<Record<NovelId, Novel>>;
  /** Ordered list of NovelIds from the most recent full scan. */
  readonly novelOrder: ReadonlyArray<NovelId>;
  /** Epoch ms of most recent successful scan. */
  readonly lastScannedAt: number | null;
  /** True while a background scan is in progress. */
  readonly isScanning: boolean;
}

// ---------------------------------------------------------------------------
// Sort & Filter options
// ---------------------------------------------------------------------------

export type LibrarySortKey = 'recentlyRead' | 'chapterCount' | 'alphabetical';

export interface LibraryFilter {
  sortBy: LibrarySortKey;
  /** Fuzzy search query string (debounced at 300 ms before consumption). */
  searchQuery: string;
}
