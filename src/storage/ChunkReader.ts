/**
 * ChunkReader — production implementation of `IChunkReader`.
 *
 * Wraps the Kotlin `ChunkReaderModule` native bridge and exposes it as an
 * `AsyncIterable<FileChunk>` so consumers can write:
 *
 * ```ts
 * for await (const chunk of reader) {
 *   paragraphParser.ingest(chunk);
 * }
 * ```
 *
 * **UTF-8 safety** is handled at the native layer (see `findUtf8SafeBoundary`
 * in ChunkReaderModule.kt). This TypeScript class trusts that every
 * `NativeChunkResult.text` is valid UTF-8 with no split codepoints.
 *
 * **Lifecycle:** Always call `close()` when done — even after the iterator
 * returns `{ done: true }`. The `for await` desugaring does NOT call
 * `return()` on normal completion in all runtimes.
 */

import type { FileChunk, ChunkReaderConfig, SafUri } from '../types/saf.types';
import { DEFAULT_CHUNK_CONFIG } from '../types/saf.types';
import type { IChunkReader, SafResult } from './ISafStorageService';
import { safOk, safErr } from './ISafStorageService';
import { NativeChunkReader } from '../native/NativeChunkReader';

export class ChunkReader implements IChunkReader {
  // ── Immutable config ────────────────────────────────────────────────────

  private readonly uri: SafUri;
  private readonly config: Readonly<ChunkReaderConfig>;

  // ── Session state ───────────────────────────────────────────────────────

  private sessionId: string | null = null;
  private _totalBytes: number = 0;
  private _currentOffset: number = 0;
  private _closed: boolean = false;
  private _eof: boolean = false;

  // ── Public readonly accessors (IChunkReader contract) ───────────────────

  get totalBytes(): number {
    return this._totalBytes;
  }

  get currentOffset(): number {
    return this._currentOffset;
  }

  // ── Construction ─────────────────────────────────────────────────────────

  private constructor(uri: SafUri, config: ChunkReaderConfig) {
    this.uri = uri;
    this.config = config;
  }

  /**
   * Factory method. Opens the native InputStream and optionally seeks.
   * Returns a fully initialized `ChunkReader` wrapped in `SafResult`.
   */
  static async create(
    uri: SafUri,
    config?: Partial<ChunkReaderConfig>,
    fromByte?: number,
  ): Promise<SafResult<ChunkReader>> {
    const merged: ChunkReaderConfig = { ...DEFAULT_CHUNK_CONFIG, ...config };
    const reader = new ChunkReader(uri, merged);

    try {
      const { sessionId, totalBytes } = await NativeChunkReader.openStream(
        uri as string,
        merged.chunkSizeBytes,
      );
      reader.sessionId = sessionId;
      reader._totalBytes = totalBytes;
    } catch (e: unknown) {
      return safErr('STREAM_ERROR', `Failed to open stream for ${uri}`, e);
    }

    // Seek to saved offset if requested
    if (fromByte !== undefined && fromByte > 0) {
      const seekResult = await reader.seek(fromByte);
      if (!seekResult.ok) {
        await reader.close();
        return seekResult;
      }
    }

    return safOk(reader);
  }

  // ── IChunkReader.seek ────────────────────────────────────────────────────

  async seek(byteOffset: number): Promise<SafResult<void>> {
    this.assertOpen();
    if (byteOffset < 0 || byteOffset > this._totalBytes) {
      return safErr(
        'STREAM_ERROR',
        `Seek offset ${byteOffset} out of range [0, ${this._totalBytes}] for ${this.uri}`,
      );
    }
    try {
      await NativeChunkReader.seekStream(this.sessionId!, byteOffset);
      this._currentOffset = byteOffset;
      this._eof = false;
      return safOk(undefined);
    } catch (e: unknown) {
      return safErr('STREAM_ERROR', `Seek to ${byteOffset} failed for ${this.uri}`, e);
    }
  }

  // ── IChunkReader.close ───────────────────────────────────────────────────

  async close(): Promise<void> {
    if (this._closed || this.sessionId === null) return;
    this._closed = true;
    try {
      await NativeChunkReader.closeStream(this.sessionId);
    } catch {
      // Best-effort close; swallow errors.
    }
    this.sessionId = null;
  }

  // ── AsyncIterable<FileChunk> ─────────────────────────────────────────────

  [Symbol.asyncIterator](): AsyncIterator<FileChunk> {
    return {
      next: async (): Promise<IteratorResult<FileChunk>> => {
        if (this._closed || this._eof) {
          return { done: true, value: undefined };
        }

        this.assertOpen();

        try {
          const raw = await NativeChunkReader.readChunk(this.sessionId!);

          const chunk: FileChunk = {
            startOffset: raw.startOffset,
            endOffset: raw.endOffset,
            text: raw.text,
            isEof: raw.isEof,
          };

          this._currentOffset = raw.endOffset;
          if (raw.isEof) {
            this._eof = true;
          }

          // Even on EOF we return the final chunk (may contain text).
          // The *next* call to `next()` will return `{ done: true }`.
          if (chunk.text.length === 0 && chunk.isEof) {
            return { done: true, value: undefined };
          }

          return { done: false, value: chunk };
        } catch (e: unknown) {
          // Surface errors as a thrown rejection inside `for await` body
          throw new Error(
            `ChunkReader stream error at offset ${this._currentOffset}: ${
              e instanceof Error ? e.message : String(e)
            }`,
          );
        }
      },

      return: async (): Promise<IteratorResult<FileChunk>> => {
        // Called when the consumer breaks out of `for await`
        await this.close();
        return { done: true, value: undefined };
      },
    };
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  /** Expose the resolved config for diagnostics and progress tracking. */
  get chunkSizeBytes(): number {
    return this.config.chunkSizeBytes;
  }

  private assertOpen(): void {
    if (this._closed) {
      throw new Error('ChunkReader is closed');
    }
    if (this.sessionId === null) {
      throw new Error('ChunkReader session was never opened');
    }
  }
}
