/**
 * ParagraphParser — stateful, streaming paragraph extractor.
 *
 * Consumes `FileChunk` objects from `IChunkReader` and emits complete
 * paragraphs ready for the virtualized list. Handles the critical
 * cross-chunk boundary case:
 *
 *   Chunk N ends:    "...the knight raised his sw"
 *   Chunk N+1 starts: "ord and charged.\n\nMeanwhile..."
 *
 * The parser buffers the trailing incomplete paragraph from chunk N
 * ("the knight raised his sw") and prepends it to chunk N+1 so the
 * consumer only ever receives fully-formed paragraphs.
 *
 * **Paragraph delimiter:** Two consecutive newlines (`\n\n`) or a single
 * newline (`\n`) when `singleNewlineBreaks` is enabled. The default is
 * double-newline mode, which is standard for novel `.txt` files.
 *
 * **Thread safety:** This class is NOT thread-safe — it is designed to be
 * driven from a single async loop on the JS thread.
 */

import type { FileChunk } from '../types/saf.types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface ParagraphParserConfig {
  /**
   * When true, treat every `\n` as a paragraph break.
   * When false (default), only `\n\n` (blank line) separates paragraphs.
   */
  singleNewlineBreaks: boolean;

  /**
   * Maximum number of characters per paragraph before force-splitting.
   * Prevents a single enormous paragraph from stalling the virtualised list.
   * Default: 10_000 characters (~2500 words).
   */
  maxParagraphChars: number;

  /**
   * If true, trim leading/trailing whitespace from each paragraph.
   * Default: true.
   */
  trimWhitespace: boolean;
}

export const DEFAULT_PARSER_CONFIG: Readonly<ParagraphParserConfig> = {
  singleNewlineBreaks: false,
  maxParagraphChars: 10_000,
  trimWhitespace: true,
};

// ---------------------------------------------------------------------------
// Paragraph with positional metadata
// ---------------------------------------------------------------------------

export interface ParsedParagraph {
  /** 0-based global index across all chunks consumed so far. */
  readonly index: number;
  /** The paragraph text content. */
  readonly text: string;
  /**
   * Approximate byte offset where this paragraph starts in the file.
   * Stored with each paragraph so `ReadingPosition.byteOffset` can be
   * derived from `visibleParagraphIndex` without re-scanning.
   */
  readonly approximateByteOffset: number;
}

// ---------------------------------------------------------------------------
// Parser class
// ---------------------------------------------------------------------------

export class ParagraphParser {
  private readonly config: Readonly<ParagraphParserConfig>;

  /** Accumulated text that hasn't yet been terminated by a delimiter. */
  private remainder: string = '';

  /** Running byte offset tracking (start of the current remainder). */
  private remainderByteOffset: number = 0;

  /** Global paragraph counter. */
  private nextIndex: number = 0;

  constructor(config?: Partial<ParagraphParserConfig>) {
    this.config = { ...DEFAULT_PARSER_CONFIG, ...config };
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Ingest a chunk and return all **complete** paragraphs found within it.
   *
   * Any text after the last delimiter is buffered internally and will be
   * emitted on the next call, or when `flush()` is called at EOF.
   */
  ingest(chunk: FileChunk): ParsedParagraph[] {
    const combined = this.remainder + chunk.text;
    const result: ParsedParagraph[] = [];

    const delimiter = this.config.singleNewlineBreaks ? '\n' : '\n\n';
    const segments = combined.split(delimiter);

    // The last segment is always potentially incomplete
    const lastSegment = segments[segments.length - 1];

    // Track byte offset progression through the combined string
    let runningByteOffset = this.remainderByteOffset;

    for (let i = 0; i < segments.length - 1; i++) {
      const raw = segments[i]!;
      const paragraphs = this.maybeSplitLong(raw);

      for (const text of paragraphs) {
        const trimmed = this.config.trimWhitespace ? text.trim() : text;
        if (trimmed.length > 0) {
          result.push({
            index: this.nextIndex++,
            text: trimmed,
            approximateByteOffset: runningByteOffset,
          });
        }
      }

      // Advance offset: segment bytes + delimiter bytes
      runningByteOffset += byteLength(raw) + byteLength(delimiter);
    }

    // Buffer the trailing incomplete segment
    this.remainder = lastSegment ?? '';
    this.remainderByteOffset = runningByteOffset;

    return result;
  }

  /**
   * Flush any buffered remainder as the final paragraph.
   * Call this exactly once after the last chunk (`chunk.isEof === true`).
   */
  flush(): ParsedParagraph[] {
    if (this.remainder.length === 0) return [];

    const result: ParsedParagraph[] = [];
    const paragraphs = this.maybeSplitLong(this.remainder);

    for (const text of paragraphs) {
      const trimmed = this.config.trimWhitespace ? text.trim() : text;
      if (trimmed.length > 0) {
        result.push({
          index: this.nextIndex++,
          text: trimmed,
          approximateByteOffset: this.remainderByteOffset,
        });
      }
    }

    this.remainder = '';
    return result;
  }

  /**
   * Reset internal state. Call when switching chapters.
   */
  reset(): void {
    this.remainder = '';
    this.remainderByteOffset = 0;
    this.nextIndex = 0;
  }

  /**
   * Returns the current global paragraph count.
   */
  get paragraphCount(): number {
    return this.nextIndex;
  }

  /**
   * Approximate byte offset of the *start* of the buffered remainder.
   * Useful for persisting a "last known" offset when saving progress.
   */
  get currentByteOffset(): number {
    return this.remainderByteOffset;
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  /**
   * If a single paragraph exceeds `maxParagraphChars`, split it at the
   * nearest word boundary to prevent a single enormous virtualised item.
   */
  private maybeSplitLong(text: string): string[] {
    const max = this.config.maxParagraphChars;
    if (text.length <= max) return [text];

    const parts: string[] = [];
    let start = 0;

    while (start < text.length) {
      if (start + max >= text.length) {
        parts.push(text.slice(start));
        break;
      }

      // Find the last space within the allowed range for a clean word break
      let splitAt = text.lastIndexOf(' ', start + max);
      if (splitAt <= start) {
        // No space found — force split at max
        splitAt = start + max;
      }

      parts.push(text.slice(start, splitAt));
      start = splitAt;

      // Skip the space we split on
      if (text[start] === ' ') start++;
    }

    return parts;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fast UTF-8 byte length calculation without creating a TextEncoder.
 * This is a hot path called per-segment during chunk parsing.
 */
function byteLength(str: string): number {
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // Surrogate pair → 4 bytes, skip next char
      bytes += 4;
      i++;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}
