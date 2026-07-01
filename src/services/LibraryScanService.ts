/**
 * LibraryScanService — shared, non-React scanning logic.
 *
 * Extracted from useLibraryScanner so both the Zustand store actions
 * and the React hook can reuse the same novel-folder scanning pipeline
 * without code duplication.
 */

import { SafStorageService } from '../storage/SafStorageService';
import type { Novel, Chapter, NovelId } from '../types/library.types';
import type { SafDocumentFile, SafUri } from '../types/saf.types';

// ---------------------------------------------------------------------------
// Slugify
// ---------------------------------------------------------------------------

export function slugify(text: string): NovelId {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') as NovelId;
}

// ---------------------------------------------------------------------------
// Natural sort for chapter filenames
// ---------------------------------------------------------------------------

export function naturalCompare(a: string, b: string): number {
  const ax: (string | number)[] = [];
  const bx: (string | number)[] = [];

  a.replace(/(\d+)|(\D+)/g, (_, d?: string, s?: string) => {
    ax.push(d ? +d : s ?? '');
    return '';
  });
  b.replace(/(\d+)|(\D+)/g, (_, d?: string, s?: string) => {
    bx.push(d ? +d : s ?? '');
    return '';
  });

  for (let i = 0; i < Math.max(ax.length, bx.length); i++) {
    const ai = ax[i] ?? '';
    const bi = bx[i] ?? '';
    if (typeof ai === 'number' && typeof bi === 'number') {
      if (ai !== bi) return ai - bi;
    } else {
      const cmp = String(ai).localeCompare(String(bi));
      if (cmp !== 0) return cmp;
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Parse chapter title from filename
// ---------------------------------------------------------------------------

export function parseChapterTitle(fileName: string): string {
  let name = fileName.replace(/\.txt$/i, '');
  const match = name.match(/^(Chapter\s*\d+)\s*\{?\s*(.*?)\s*\}?\s*$/i);
  if (match) {
    const [, prefix, title] = match;
    return title ? `${prefix} — ${title}` : prefix ?? name;
  }
  return name;
}

// ---------------------------------------------------------------------------
// Scan a single novel folder
// ---------------------------------------------------------------------------

export async function scanNovelFolder(
  saf: SafStorageService,
  folder: SafDocumentFile,
): Promise<Novel | null> {
  const folderUri = folder.uri;
  const novelId = slugify(folder.name);

  const childrenResult = await saf.listDirectory(folderUri);
  if (!childrenResult.ok) return null;
  const children = childrenResult.value;

  // ── Cover image ─────────────────────────────────────────────────────────
  const cover = children.find((f) => f.isFile && /^cover\.(jpg|jpeg|png|webp)$/i.test(f.name));

  // ── Description ─────────────────────────────────────────────────────────
  const descFile = children.find((f) => f.isFile && f.name.toLowerCase() === 'description.txt');
  let description: string | null = null;
  if (descFile) {
    const descResult = await saf.readSmallFile(descFile.uri);
    if (descResult.ok) {
      description = descResult.value.trim();
    }
  }

  // ── Locate chapter files ────────────────────────────────────────────────
  // Preferred layout: a `chapters/` sub-folder.
  // Fallback (Moon Reader-style): loose `.txt` files directly inside the
  // novel folder. Either way we skip a folder with no readable text files.
  const chaptersDir = children.find((f) => f.isDirectory && f.name.toLowerCase() === 'chapters');

  let chapterFiles: SafDocumentFile[];
  let chaptersUri: SafUri;

  if (chaptersDir) {
    const chapListResult = await saf.listDirectory(chaptersDir.uri);
    if (!chapListResult.ok) return null;
    chapterFiles = chapListResult.value.filter(
      (f) => f.isFile && f.name.toLowerCase().endsWith('.txt'),
    );
    chaptersUri = chaptersDir.uri;
  } else {
    // Loose text files in the folder itself — treat each as a chapter.
    // Exclude the optional description.txt so it isn't read as a chapter.
    chapterFiles = children.filter(
      (f) =>
        f.isFile &&
        f.name.toLowerCase().endsWith('.txt') &&
        f.name.toLowerCase() !== 'description.txt',
    );
    chaptersUri = folderUri;
  }

  if (chapterFiles.length === 0) return null;

  const txtFiles = [...chapterFiles].sort((a, b) => naturalCompare(a.name, b.name));

  const chapters: Chapter[] = txtFiles.map((f, i) => ({
    id: `${novelId}__${f.name}`,
    title: parseChapterTitle(f.name),
    uri: f.uri,
    fileName: f.name,
    index: i + 1,
    sizeBytes: f.size,
  }));

  return {
    id: novelId,
    title: folder.name,
    folderUri,
    chaptersUri,
    coverUri: cover ? cover.uri : null,
    description,
    chapters,
    totalChapters: chapters.length,
    scannedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Full library tree scan (non-React, callable from store actions)
// ---------------------------------------------------------------------------

/**
 * Walk the root SAF tree and return all discovered novels.
 *
 * @param treeUri  Root library tree URI
 * @param onNovel  Optional callback invoked per novel for incremental UI updates
 */
export async function scanLibraryTree(
  treeUri: SafUri,
  onNovel?: (novel: Novel) => void,
): Promise<Novel[]> {
  const saf = SafStorageService.getInstance();
  const rootResult = await saf.listDirectory(treeUri);
  if (!rootResult.ok) {
    console.error('[ScanService] Root listing failed:', rootResult.error.message);
    return [];
  }

  const novelFolders = rootResult.value.filter((f) => f.isDirectory);
  const results: Novel[] = [];

  for (const folder of novelFolders) {
    try {
      const novel = await scanNovelFolder(saf, folder);
      if (novel) {
        results.push(novel);
        onNovel?.(novel);
      }
    } catch (e) {
      console.warn(`[ScanService] Skipping "${folder.name}":`, e);
    }
  }

  return results;
}
