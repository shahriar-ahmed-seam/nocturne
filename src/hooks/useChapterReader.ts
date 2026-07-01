/**
 * useChapterReader — drives the chunked file loading pipeline.
 *
 * Opens a ChunkReader for a chapter, feeds 64 KB chunks through the streaming
 * ParagraphParser, and incrementally pushes parsed paragraphs to the Zustand
 * readingStore. This is what lets Nocturne open 50 MB+ chapter files smoothly:
 * only a small window of text is ever materialised ahead of the reader, and
 * FlashList virtualises what's on screen.
 *
 * Robustness for very large files:
 *   - A single async iterator is reused for the whole chapter (no re-creation).
 *   - A synchronous re-entrancy guard (`loadingRef`) prevents overlapping batch
 *     reads when `onEndReached` fires rapidly during fast scrolling.
 *   - The initial load keeps fetching until the viewport is comfortably filled,
 *     so short first chunks don't stall `onEndReached`.
 *
 * Usage inside ReaderScreen:
 * ```tsx
 * const { loadInitial, loadMore, cleanup, getCurrentByteOffset } = useChapterReader();
 * useEffect(() => { loadInitial(chapter, savedByteOffset); }, [chapter]);
 * ```
 */

import { useCallback, useRef } from 'react';
import { useReadingStore } from '../store/readingStore';
import { SafStorageService } from '../storage/SafStorageService';
import { ParagraphParser } from '../storage/ParagraphParser';
import type { IChunkReader, SafResult } from '../storage/ISafStorageService';
import type { FileChunk } from '../types/saf.types';
import type { Chapter } from '../types/library.types';

/** Chunks fetched per batch. 4 × 64 KB = 256 KB — enough to stay ahead of a
 *  fast scroll without blocking the JS thread for long. */
const CHUNKS_PER_BATCH = 4;

/** Keep loading on first open until at least this many paragraphs exist, so the
 *  screen is filled and `onEndReached` can take over. */
const MIN_INITIAL_PARAGRAPHS = 30;

/** Safety valve: never loop the initial fill more than this many batches. */
const MAX_INITIAL_BATCHES = 24;

type ChunkIterator = AsyncIterator<FileChunk>;

export function useChapterReader() {
  const appendParagraphs = useReadingStore((s) => s.appendParagraphs);
  const setLoadingChunk = useReadingStore((s) => s.setLoadingChunk);

  const readerRef = useRef<IChunkReader | null>(null);
  const iteratorRef = useRef<ChunkIterator | null>(null);
  const parserRef = useRef<ParagraphParser>(new ParagraphParser());
  const eofRef = useRef(false);
  /** Synchronous guard — more reliable than the async store flag under rapid
   *  onEndReached bursts. */
  const loadingRef = useRef(false);

  /** Tear down any existing reader and parser state. */
  const cleanup = useCallback(async () => {
    if (readerRef.current) {
      await readerRef.current.close();
      readerRef.current = null;
    }
    iteratorRef.current = null;
    parserRef.current.reset();
    eofRef.current = false;
    loadingRef.current = false;
  }, []);

  /**
   * Read up to CHUNKS_PER_BATCH chunks and push parsed paragraphs to the store.
   * Returns the number of new paragraphs appended (0 at EOF).
   */
  const readBatch = useCallback(async (): Promise<number> => {
    const iterator = iteratorRef.current;
    if (!iterator || eofRef.current) return 0;

    const parser = parserRef.current;
    const allNew: string[] = [];
    const allOffsets: number[] = [];

    for (let i = 0; i < CHUNKS_PER_BATCH; i++) {
      const iterResult = await iterator.next();
      if (iterResult.done) {
        eofRef.current = true;
        parser.flush().forEach((p) => {
          allNew.push(p.text);
          allOffsets.push(p.approximateByteOffset);
        });
        break;
      }
      const chunk = iterResult.value;
      parser.ingest(chunk).forEach((p) => {
        allNew.push(p.text);
        allOffsets.push(p.approximateByteOffset);
      });

      if (chunk.isEof) {
        eofRef.current = true;
        parser.flush().forEach((p) => {
          allNew.push(p.text);
          allOffsets.push(p.approximateByteOffset);
        });
        break;
      }
    }

    if (allNew.length > 0) {
      appendParagraphs(allNew, allOffsets);
    }
    return allNew.length;
  }, [appendParagraphs]);

  /**
   * Open a fresh ChunkReader for the given chapter and load enough to fill the
   * viewport. Cleans up any prior reader first.
   */
  const loadInitial = useCallback(
    async (chapter: Chapter, fromByte?: number) => {
      await cleanup();
      loadingRef.current = true;
      setLoadingChunk(true);

      try {
        const saf = SafStorageService.getInstance();
        const result: SafResult<IChunkReader> = await saf.createChunkReader(
          chapter.uri,
          undefined,
          fromByte,
        );

        if (!result.ok) {
          console.error('[ChapterReader] Failed to open:', result.error.message);
          return;
        }

        readerRef.current = result.value;
        iteratorRef.current = result.value[Symbol.asyncIterator]();

        // Fill the first screen: keep reading until we have enough paragraphs
        // or we hit EOF, capped so a pathological file can't loop forever.
        let total = 0;
        let batches = 0;
        while (total < MIN_INITIAL_PARAGRAPHS && !eofRef.current && batches < MAX_INITIAL_BATCHES) {
          total += await readBatch();
          batches += 1;
        }
      } finally {
        loadingRef.current = false;
        setLoadingChunk(false);
      }
    },
    [cleanup, setLoadingChunk, readBatch],
  );

  /**
   * "Load more" trigger — wired to FlashList's `onEndReached`. The synchronous
   * `loadingRef` guard drops overlapping calls so we never read the same stream
   * region twice or thrash the store.
   */
  const loadMore = useCallback(async () => {
    if (eofRef.current || loadingRef.current) return;
    loadingRef.current = true;
    setLoadingChunk(true);
    try {
      await readBatch();
    } finally {
      loadingRef.current = false;
      setLoadingChunk(false);
    }
  }, [readBatch, setLoadingChunk]);

  /** Byte offset of the reader — used for progress persistence. */
  const getCurrentByteOffset = useCallback((): number => {
    return readerRef.current?.currentOffset ?? 0;
  }, []);

  /** Total bytes in the file — for byte-based progress percentage. */
  const getTotalBytes = useCallback((): number => {
    return readerRef.current?.totalBytes ?? 0;
  }, []);

  /**
   * Re-read a single paragraph's text from disk at a known byte offset.
   * Used to re-hydrate a paragraph whose text was released by the memory
   * window when the reader scrolls back to it. Opens a short-lived reader so
   * it never disturbs the main forward-reading stream.
   */
  const rehydrateFromOffset = useCallback(async (byteOffset: number): Promise<string | null> => {
    if (byteOffset < 0) return null;
    const chapter = useReadingStore.getState().activeChapter;
    if (!chapter) return null;

    const saf = SafStorageService.getInstance();
    const result = await saf.createChunkReader(chapter.uri, undefined, byteOffset);
    if (!result.ok) return null;

    const reader = result.value;
    try {
      const iterator = reader[Symbol.asyncIterator]();
      const parser = new ParagraphParser();
      for (let i = 0; i < 4; i++) {
        const r = await iterator.next();
        if (r.done) break;
        const parsed = parser.ingest(r.value);
        if (parsed.length > 0) return parsed[0]?.text ?? null;
        if (r.value.isEof) break;
      }
      const flushed = parser.flush();
      return flushed[0]?.text ?? null;
    } catch {
      return null;
    } finally {
      await reader.close();
    }
  }, []);

  return {
    loadInitial,
    loadMore,
    cleanup,
    isEof: eofRef.current,
    getCurrentByteOffset,
    getTotalBytes,
    rehydrateFromOffset,
  };
}
