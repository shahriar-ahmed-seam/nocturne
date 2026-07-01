/**
 * BackupService — read / write cycle for `reading_backup.json`.
 *
 * The backup file lives at the ROOT of the user's SAF library tree,
 * co-located with all novel folders. This makes it portable — if the
 * user copies the folder to another device, progress travels with it.
 *
 * Schema: {@link ReadingBackupFile} (version 1).
 */

import { SafStorageService } from '../storage/SafStorageService';
import { safOk, safErr } from '../storage/ISafStorageService';
import type { SafResult } from '../storage/ISafStorageService';
import type { SafUri } from '../types/saf.types';
import type { NovelId } from '../types/library.types';
import type { ReadingBackupFile, NovelReadingProgress } from '../types/state.types';

const BACKUP_FILENAME = 'reading_backup.json';
const BACKUP_MIME = 'application/json';

// ---------------------------------------------------------------------------
// Empty backup factory
// ---------------------------------------------------------------------------

function createEmptyBackup(): ReadingBackupFile {
  return {
    version: 1,
    lastUpdated: new Date().toISOString(),
    progress: {} as Record<NovelId, NovelReadingProgress>,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attempt to load `reading_backup.json` from the SAF library root.
 * Returns an empty backup shell if the file does not yet exist.
 */
export async function loadBackup(treeUri: SafUri): Promise<SafResult<ReadingBackupFile>> {
  const saf = SafStorageService.getInstance();

  // Resolve the file — FILE_NOT_FOUND is not an error, just means first run
  const fileResult = await saf.resolveChild(treeUri, BACKUP_FILENAME);
  if (!fileResult.ok) {
    if (fileResult.error.code === 'FILE_NOT_FOUND') {
      return safOk(createEmptyBackup());
    }
    return fileResult;
  }

  const contentResult = await saf.readSmallFile(fileResult.value.uri);
  if (!contentResult.ok) return contentResult;

  try {
    const parsed = JSON.parse(contentResult.value) as ReadingBackupFile;
    if (parsed.version !== 1) {
      return safErr('JSON_PARSE_ERROR', `Unsupported backup version: ${parsed.version}`);
    }
    return safOk(parsed);
  } catch (e: unknown) {
    return safErr(
      'JSON_PARSE_ERROR',
      `Failed to parse ${BACKUP_FILENAME}: ${e instanceof Error ? e.message : String(e)}`,
      e,
    );
  }
}

/**
 * Serialize the current progress map and write it to `reading_backup.json`.
 *
 * If the file already exists it is overwritten; otherwise a new file is
 * created at the SAF library root.
 */
export async function saveBackup(
  treeUri: SafUri,
  progressMap: Readonly<Record<NovelId, NovelReadingProgress>>,
): Promise<SafResult<void>> {
  const saf = SafStorageService.getInstance();

  const backup: ReadingBackupFile = {
    version: 1,
    lastUpdated: new Date().toISOString(),
    progress: progressMap,
  };

  const json = JSON.stringify(backup, null, 2);

  // Try to overwrite existing file first (faster path)
  const existing = await saf.resolveChild(treeUri, BACKUP_FILENAME);
  if (existing.ok) {
    return saf.writeFile(existing.value.uri, json);
  }

  // First save — create the file
  const createResult = await saf.createFile(treeUri, BACKUP_FILENAME, BACKUP_MIME, json);
  if (!createResult.ok) return createResult;
  return safOk(undefined);
}
