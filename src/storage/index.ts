/**
 * Public barrel — re-exports all storage contracts.
 */
export type {
  ISafStorageService,
  IChunkReader,
  SafResult,
  SafError,
  SafErrorCode,
} from './ISafStorageService';

export { safOk, safErr } from './ISafStorageService';

// Concrete implementation
export { SafStorageService } from './SafStorageService';

// Chunk reader (direct access rarely needed — prefer ISafStorageService.createChunkReader)
export { ChunkReader } from './ChunkReader';

// Paragraph parser
export { ParagraphParser } from './ParagraphParser';
export type { ParsedParagraph, ParagraphParserConfig } from './ParagraphParser';
export { DEFAULT_PARSER_CONFIG } from './ParagraphParser';
