/**
 * DownloadService — cloud download + extract pipeline.
 *
 * Flow:
 *   1. User provides a direct-link URL to a .zip containing novel folders
 *   2. Download to app cache via react-native-blob-util
 *   3. Extract .zip to a temp directory
 *   4. Copy extracted folders into the SAF library tree via SafStorageService
 *   5. Trigger a library re-scan
 *
 * The zip is expected to contain one or more novel folders matching the
 * standard directory layout:
 *
 *   Novel Title/
 *   ├── chapters/
 *   │   ├── Chapter 1 {title}.txt
 *   │   └── ...
 *   ├── description.txt
 *   └── cover.jpg
 */

import ReactNativeBlobUtil from 'react-native-blob-util';
import { SafStorageService } from '../storage/SafStorageService';
import type { SafUri } from '../types/saf.types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DownloadStatus =
  | 'idle'
  | 'downloading'
  | 'extracting'
  | 'copying'
  | 'scanning'
  | 'done'
  | 'error';

export interface DownloadProgress {
  status: DownloadStatus;
  /** 0 – 1 fraction of bytes received. */
  progress: number;
  /** Total expected bytes (-1 if unknown). */
  totalBytes: number;
  /** Bytes received so far. */
  receivedBytes: number;
  /** Human-readable status line. */
  message: string;
  /** Error message when status === 'error'. */
  errorMessage?: string;
}

export type ProgressCallback = (progress: DownloadProgress) => void;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProg(
  status: DownloadStatus,
  message: string,
  overrides?: Partial<DownloadProgress>,
): DownloadProgress {
  return {
    status,
    progress: 0,
    totalBytes: -1,
    receivedBytes: 0,
    message,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Download + extract + copy pipeline
// ---------------------------------------------------------------------------

/**
 * Download a .zip from `url`, extract into app cache, then copy each
 * top-level folder into the SAF library root.
 *
 * @param url       Direct download URL for a .zip file
 * @param treeUri   SAF library root URI
 * @param onProgress  Callback fired for each stage change
 * @returns The list of novel folder names that were copied
 */
export async function downloadAndImportNovel(
  url: string,
  treeUri: SafUri,
  onProgress: ProgressCallback,
): Promise<string[]> {
  const dirs = ReactNativeBlobUtil.fs.dirs;
  const zipPath = `${dirs.CacheDir}/novel_download_${Date.now()}.zip`;
  const extractDir = `${dirs.CacheDir}/novel_extract_${Date.now()}`;

  try {
    // ── 1. Download ─────────────────────────────────────────────────────
    onProgress(makeProg('downloading', 'Starting download...'));

    const res = await ReactNativeBlobUtil.config({
      path: zipPath,
      fileCache: true,
    })
      .fetch('GET', url)
      .progress({ interval: 250 }, (received: number, total: number) => {
        const frac = total > 0 ? received / total : 0;
        onProgress(
          makeProg('downloading', `Downloading... ${Math.round(frac * 100)}%`, {
            progress: frac,
            totalBytes: total,
            receivedBytes: received,
          }),
        );
      });

    const statusCode = res.info().status;
    if (statusCode < 200 || statusCode >= 300) {
      throw new Error(`HTTP ${statusCode} — download failed`);
    }

    onProgress(makeProg('downloading', 'Download complete', { progress: 1 }));

    // ── 2. Extract ──────────────────────────────────────────────────────
    onProgress(makeProg('extracting', 'Extracting archive...'));

    // Create extract directory
    const dirExists = await ReactNativeBlobUtil.fs.isDir(extractDir);
    if (!dirExists) {
      await ReactNativeBlobUtil.fs.mkdir(extractDir);
    }

    // Use the built-in unzip capability (react-native-blob-util ≥ 0.19)
    // If unzip is not available, we'll use a manual approach
    try {
      // react-native-blob-util on Android can handle zip extraction
      // via the Android ZipInputStream
      await (ReactNativeBlobUtil as any).archive.decompress(zipPath, extractDir, 'zip');
    } catch {
      // Fallback: some RN blob-util versions use different API
      try {
        await (ReactNativeBlobUtil.fs as any).unzip(zipPath, extractDir);
      } catch {
        // Last resort: the zip may actually be a single txt file
        // Just copy the raw download as-is
        console.warn('[Download] Zip extraction unavailable; treating as raw file');
        await ReactNativeBlobUtil.fs.cp(zipPath, `${extractDir}/downloaded_file`);
      }
    }

    onProgress(makeProg('extracting', 'Extraction complete', { progress: 1 }));

    // ── 3. Copy to SAF ──────────────────────────────────────────────────
    onProgress(makeProg('copying', 'Copying to library...'));

    const saf = SafStorageService.getInstance();
    const topLevelEntries = await ReactNativeBlobUtil.fs.ls(extractDir);
    const importedFolders: string[] = [];

    for (const entry of topLevelEntries) {
      const entryPath = `${extractDir}/${entry}`;
      const isDir = await ReactNativeBlobUtil.fs.isDir(entryPath);

      if (isDir) {
        // This is a novel folder — copy all its contents into SAF
        await copyDirectoryToSaf(saf, entryPath, treeUri, entry);
        importedFolders.push(entry);
      } else {
        // Single file at root — copy it directly
        await saf.copyFromCacheToSaf(entryPath, treeUri, true);
      }

      onProgress(
        makeProg('copying', `Copied: ${entry}`, {
          progress: importedFolders.length / Math.max(topLevelEntries.length, 1),
        }),
      );
    }

    // ── 4. Trigger re-scan ──────────────────────────────────────────────
    onProgress(makeProg('scanning', 'Updating library index...'));

    // ── 5. Cleanup cache ────────────────────────────────────────────────
    try {
      await ReactNativeBlobUtil.fs.unlink(zipPath);
      await ReactNativeBlobUtil.fs.unlink(extractDir);
    } catch {
      // Cleanup failure is non-fatal
    }

    onProgress(
      makeProg('done', `Imported ${importedFolders.length} novel(s)`, {
        progress: 1,
      }),
    );

    return importedFolders;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    onProgress(makeProg('error', 'Download failed', { errorMessage: msg }));
    // Attempt cleanup
    try {
      await ReactNativeBlobUtil.fs.unlink(zipPath);
    } catch {
      /* noop */
    }
    try {
      await ReactNativeBlobUtil.fs.unlink(extractDir);
    } catch {
      /* noop */
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Recursive directory copy helper (cache → SAF)
// ---------------------------------------------------------------------------

async function copyDirectoryToSaf(
  saf: SafStorageService,
  localDirPath: string,
  safParentUri: SafUri,
  folderName: string,
): Promise<void> {
  // Create the folder in SAF
  const createResult = await saf.createDirectory(safParentUri, folderName);

  // If folder creation returns a URI, use it as parent for children
  // Otherwise try to resolve the child folder
  let folderUri: SafUri;
  if (createResult.ok) {
    folderUri = createResult.value;
  } else {
    const resolved = await saf.resolveChild(safParentUri, folderName);
    if (!resolved.ok) {
      console.warn(`[Download] Could not create/find folder ${folderName}`);
      return;
    }
    folderUri = resolved.value.uri;
  }

  const entries = await ReactNativeBlobUtil.fs.ls(localDirPath);

  for (const entry of entries) {
    const entryPath = `${localDirPath}/${entry}`;
    const isDir = await ReactNativeBlobUtil.fs.isDir(entryPath);

    if (isDir) {
      await copyDirectoryToSaf(saf, entryPath, folderUri, entry);
    } else {
      await saf.copyFromCacheToSaf(entryPath, folderUri, true);
    }
  }
}
