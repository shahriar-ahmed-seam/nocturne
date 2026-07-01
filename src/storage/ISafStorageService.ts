/**
 * ISafStorageService — The canonical Storage Access Framework abstraction.
 *
 * ALL file operations that touch the user's library MUST go through this
 * interface. No consumer anywhere in the app shall import `react-native-fs`
 * or call `RNFS.*` for library files.
 *
 * The concrete implementation (SafStorageService) lives in
 * `src/storage/SafStorageService.ts` and wraps `react-native-saf-x`.
 * A mock implementation `MockSafStorageService` is provided for Jest tests.
 *
 * This separation ensures:
 *   1. Zero POSIX paths on Android 11+ (Scoped Storage compliance).
 *   2. Persistable URI permissions survive reboots.
 *   3. Full testability without native modules.
 */

import type {
  SafUri,
  SafDocumentFile,
  FileChunk,
  ChunkReaderConfig,
  PersistedTreePermission,
} from '../types/saf.types';

// ---------------------------------------------------------------------------
// Result / Error pattern (no uncaught exceptions crossing the boundary)
// ---------------------------------------------------------------------------

export type SafResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: SafError };

export type SafErrorCode =
  | 'PERMISSION_DENIED' // User declined the picker
  | 'PERMISSION_NOT_PERSISTED' // takePersistableUriPermission failed
  | 'FILE_NOT_FOUND'
  | 'DIRECTORY_NOT_FOUND'
  | 'READ_ERROR'
  | 'WRITE_ERROR'
  | 'STREAM_ERROR'
  | 'JSON_PARSE_ERROR'
  | 'UNKNOWN';

export interface SafError {
  readonly code: SafErrorCode;
  readonly message: string;
  /** Underlying native error, if any. */
  readonly cause?: unknown;
}

// Convenience constructors
export const safOk = <T>(value: T): SafResult<T> => ({ ok: true, value });
export const safErr = (code: SafErrorCode, message: string, cause?: unknown): SafResult<never> => ({
  ok: false,
  error: { code, message, cause },
});

// ---------------------------------------------------------------------------
// Core interface
// ---------------------------------------------------------------------------

export interface ISafStorageService {
  // ─── Permission Management ────────────────────────────────────────────────

  /**
   * Launch ACTION_OPEN_DOCUMENT_TREE and request a persisted read/write
   * permission on the selected folder.
   *
   * Internally calls `takePersistableUriPermission` immediately after
   * the user confirms the picker.
   *
   * @returns The persisted tree permission record on success.
   */
  requestLibraryPermission(): Promise<SafResult<PersistedTreePermission>>;

  /**
   * Check whether a previously granted tree URI still has a valid
   * persisted permission (survives across reboots).
   */
  hasValidPermission(treeUri: SafUri): Promise<SafResult<boolean>>;

  /**
   * Release (revoke) a previously persisted permission.
   * Called on "Remove Library" action.
   */
  releasePermission(treeUri: SafUri): Promise<SafResult<void>>;

  // ─── Directory Operations ─────────────────────────────────────────────────

  /**
   * List the immediate children of a directory URI.
   * Does NOT recurse.
   */
  listDirectory(dirUri: SafUri): Promise<SafResult<SafDocumentFile[]>>;

  /**
   * Resolve a child file or folder by display name within a parent directory.
   * Returns FILE_NOT_FOUND if it does not exist.
   */
  resolveChild(parentUri: SafUri, childName: string): Promise<SafResult<SafDocumentFile>>;

  /**
   * Check whether a URI exists and is accessible.
   */
  exists(uri: SafUri): Promise<SafResult<boolean>>;

  // ─── File Reading ─────────────────────────────────────────────────────────

  /**
   * Read an entire small file (e.g., description.txt, reading_backup.json)
   * into a single string.
   *
   * ⚠️  Must NOT be used for chapter .txt files. Use `createChunkReader`
   * for those to prevent UI-thread stalls on 50 MB+ files.
   */
  readSmallFile(uri: SafUri, encoding?: 'utf-8' | 'utf-16le'): Promise<SafResult<string>>;

  /**
   * Create a lazy chunk reader for a large chapter file.
   *
   * The returned `IChunkReader` is an async iterator; calling `next()`
   * reads the next fixed-size chunk from the SAF InputStream without
   * loading the entire file into memory.
   *
   * @param uri       SAF URI of the chapter .txt file
   * @param config    Optional override of chunk size and encoding
   * @param fromByte  Optional seek offset (resume from saved position)
   */
  createChunkReader(
    uri: SafUri,
    config?: Partial<ChunkReaderConfig>,
    fromByte?: number,
  ): Promise<SafResult<IChunkReader>>;

  // ─── File Writing ─────────────────────────────────────────────────────────

  /**
   * Overwrite (or create) a file with a UTF-8 string.
   * Used exclusively for `reading_backup.json`.
   */
  writeFile(uri: SafUri, content: string): Promise<SafResult<void>>;

  /**
   * Create a file inside a directory. Returns the new file's URI.
   * If a file with the same name already exists, it is replaced.
   */
  createFile(
    parentUri: SafUri,
    fileName: string,
    mimeType: string,
    content: string,
  ): Promise<SafResult<SafUri>>;

  /**
   * Create a directory (and any missing parents) inside a SAF tree.
   * Returns the new directory's URI.
   */
  createDirectory(parentUri: SafUri, dirName: string): Promise<SafResult<SafUri>>;

  // ─── SAF Copy (used by the Cloud Downloader pipeline) ────────────────────

  /**
   * Copy a file from a temporary cache path (file:// or cache URI) into a
   * SAF directory. Used after extracting a .zip download.
   *
   * @param sourceCachePath  Absolute POSIX path inside the app's cache dir
   *                         (this is allowed since it's the app's own sandbox).
   * @param destDirUri       SAF URI of the destination directory.
   * @param overwrite        Replace if a file with the same name exists.
   */
  copyFromCacheToSaf(
    sourceCachePath: string,
    destDirUri: SafUri,
    overwrite?: boolean,
  ): Promise<SafResult<SafUri>>;
}

// ---------------------------------------------------------------------------
// Chunk reader interface
// ---------------------------------------------------------------------------

/**
 * A forward-only, lazy reader over a SAF InputStream.
 *
 * Usage:
 * ```ts
 * const readerResult = await safService.createChunkReader(chapterUri);
 * if (!readerResult.ok) { ... handle error ... }
 * const reader = readerResult.value;
 *
 * for await (const chunk of reader) {
 *   processChunk(chunk); // parse into paragraphs, feed to virtualized list
 * }
 * await reader.close();
 * ```
 */
export interface IChunkReader extends AsyncIterable<FileChunk> {
  /** Total file size in bytes (known upfront from DocumentFile.length). */
  readonly totalBytes: number;

  /**
   * Current read position (byte offset).
   * Useful for saving progress mid-stream.
   */
  readonly currentOffset: number;

  /**
   * Seek to a specific byte offset.
   * Closes the current stream and reopens from the given offset.
   * Used when resuming from a saved `byteOffset`.
   */
  seek(byteOffset: number): Promise<SafResult<void>>;

  /**
   * Explicitly close the underlying SAF InputStream.
   * Always call this when done — even if iteration completed normally.
   */
  close(): Promise<void>;
}
