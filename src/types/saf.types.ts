/**
 * SAF (Storage Access Framework) domain types.
 *
 * All file URIs in this app are Android content:// URIs obtained via
 * ACTION_OPEN_DOCUMENT_TREE — never posix paths on external storage.
 */

/** An opaque Android content:// URI string. Never a file:// path. */
export type SafUri = string & { readonly __brand: 'SafUri' };

/** Cast a raw string to a SafUri. Validate at the boundary (SAF layer). */
export const toSafUri = (raw: string): SafUri => raw as SafUri;

// ---------------------------------------------------------------------------
// DocumentFile representation
// ---------------------------------------------------------------------------

export type DocumentMimeType =
  | 'text/plain'
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'application/zip'
  | 'application/octet-stream'
  | (string & {}); // allow non-exhaustive MIME strings while keeping autocomplete

export interface SafDocumentFile {
  /** content:// URI */
  readonly uri: SafUri;
  /** Human-readable display name (filename with extension) */
  readonly name: string;
  readonly mimeType: DocumentMimeType;
  readonly isDirectory: boolean;
  readonly isFile: boolean;
  /** File size in bytes. -1 if unavailable (e.g. virtual files). */
  readonly size: number;
  /** Last modified epoch milliseconds. */
  readonly lastModified: number;
}

// ---------------------------------------------------------------------------
// Byte-range streaming
// ---------------------------------------------------------------------------

/**
 * A fixed-size chunk read from a SAF input stream.
 * The engine always works in byte offsets, never string indices,
 * so layout recalculations are font-size-agnostic.
 */
export interface FileChunk {
  /** Global byte offset of the first byte in this chunk. */
  readonly startOffset: number;
  /** Global byte offset one past the last byte in this chunk. */
  readonly endOffset: number;
  /** Raw UTF-8 text content of this chunk. */
  readonly text: string;
  /** True if this is the final chunk in the file. */
  readonly isEof: boolean;
}

/** Configuration for the chunked reader. */
export interface ChunkReaderConfig {
  /** Chunk size in bytes. Default: 65_536 (64 KB). */
  chunkSizeBytes: number;
  /** Character encoding. Default: 'utf-8'. */
  encoding: 'utf-8' | 'utf-16le';
}

export const DEFAULT_CHUNK_CONFIG: Readonly<ChunkReaderConfig> = {
  chunkSizeBytes: 65_536,
  encoding: 'utf-8',
};

// ---------------------------------------------------------------------------
// Persisted tree permissions
// ---------------------------------------------------------------------------

export interface PersistedTreePermission {
  readonly treeUri: SafUri;
  /** ISO-8601 date string when the permission was first granted. */
  readonly grantedAt: string;
  /** Flag confirming takePersistableUriPermission was called. */
  readonly isPersisted: true;
}
