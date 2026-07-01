/**
 * useChapterReader — drives the chunked file loading pipeline.
 *
 * Opens a ChunkReader for a chapter, feeds chunks through ParagraphParser,
 * and incrementally pushes parsed paragraphs to the Zustand readingStore.
 *
 * Supports:
 *   - Initial load from byte 0 or a saved byteOffset
 *   - "Load more" pagination (called when the user scrolls near the bottom)
 *   - Clean teardown on chapter change / unmount
 *
 * Usage inside ReaderScreen:
 * ```tsx
 * const { loadInitial, loadMore, isReading, progress } = useChapterReader();
 * useEffect(() => { loadInitial(chapter, savedByteOffset); }, [chapter]);
 * ```
 */

import { useCallback, useRef } from 'react';
import { useReadingStore } from '../store/readingStore';
import { SafStorageService } from '../storage/SafStorageService';
import { ParagraphParser } from '../storage/ParagraphParser';
import type { IChunkReader } from '../storage/ISafStorageService';
import type { Chapter } from '../types/library.types';

// Number of chunks to pre-fetch in each "load more" batch.
const CHUNKS_PER_BATCH = 5;

export function useChapterReader() {
  const appendParagraphs = useReadingStore((s) => s.appendParagraphs);
  const setLoadingChunk = useReadingStore((s) => s.setLoadingChunk);
  const isLoadingChunk = useReadingStore((s) => s.isLoadingChunk);

  const readerRef = useRef<IChunkReader | null>(null);
  const parserRef = useRef<ParagraphParser>(new ParagraphParser());
  const eofRef = useRef(false);

  /** Tear down any existing reader and parser state. */
  const cleanup = useCallback(async () => {
    if (readerRef.current) {
      await readerRef.current.close();
      readerRef.current = null;
    }
    parserRef.current.reset();
    eofRef.current = false;
  }, []);

  /**
   * Read the next N chunks and push parsed paragraphs to the store.
   * Called by `loadInitial` and by the FlashList `onEndReached`.
   */
  const readBatch = useCallback(async () => {
    const reader = readerRef.current;
    if (!reader || eofRef.current) return;

    const parser = parserRef.current;
    const allNew: string[] = [];

    for (let i = 0; i < CHUNKS_PER_BATCH; i++) {
      const iterResult = await reader[Symbol.asyncIterator]().next();
      if (iterResult.done) {
        eofRef.current = true;
        // Flush remaining text as the final paragraphs
        const flushed = parser.flush();
        flushed.forEach((p) => allNew.push(p.text));
        break;
      }
      const chunk = iterResult.value;
      const parsed = parser.ingest(chunk);
      parsed.forEach((p) => allNew.push(p.text));

      if (chunk.isEof) {
        eofRef.current = true;
        const flushed = parser.flush();
        flushed.forEach((p) => allNew.push(p.text));
        break;
      }
    }

    if (allNew.length > 0) {
      appendParagraphs(allNew);
    }
  }, [appendParagraphs]);

  /**
   * Open a fresh ChunkReader for the given chapter and load the first batch.
   * Cleans up any prior reader first.
   */
  const loadInitial = useCallback(
    async (chapter: Chapter, fromByte?: number) => {
      await cleanup();
      setLoadingChunk(true);

      const saf = SafStorageService.getInstance();
      const result = await saf.createChunkReader(chapter.uri, undefined, fromByte);

      if (!result.ok) {
        console.error('[ChapterReader] Failed to open:', result.error.message);
        setLoadingChunk(false);
        return;
      }

      readerRef.current = result.value;
      await readBatch();
      setLoadingChunk(false);
    },
    [cleanup, setLoadingChunk, readBatch],
  );

  /**
   * "Load more" trigger — designed to be called from FlashList's `onEndReached`.
   */
  const loadMore = useCallback(async () => {
    if (eofRef.current || isLoadingChunk) return;
    setLoadingChunk(true);
    await readBatch();
    setLoadingChunk(false);
  }, [readBatch, isLoadingChunk, setLoadingChunk]);

  /** Byte offset of the reader — used for progress persistence. */
  const getCurrentByteOffset = useCallback((): number => {
    return readerRef.current?.currentOffset ?? 0;
  }, []);

  /** Total bytes in the file — for progress bar percentage. */
  const getTotalBytes = useCallback((): number => {
    return readerRef.current?.totalBytes ?? 0;
  }, []);

  return {
    loadInitial,
    loadMore,
    cleanup,
    isEof: eofRef.current,
    getCurrentByteOffset,
    getTotalBytes,
  };
}
