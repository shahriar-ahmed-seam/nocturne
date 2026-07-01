/**
 * Public barrel — re-exports all type contracts from the types/ directory.
 * Consumers should import from '@types' (resolved via tsconfig paths)
 * rather than from individual type files directly.
 */
export type {
  SafUri,
  SafDocumentFile,
  FileChunk,
  ChunkReaderConfig,
  PersistedTreePermission,
} from './saf.types';

export { toSafUri, DEFAULT_CHUNK_CONFIG } from './saf.types';

export type {
  Chapter,
  Novel,
  NovelId,
  Library,
  LibraryFilter,
  LibrarySortKey,
} from './library.types';

export type {
  ReadingPosition,
  Bookmark,
  NovelReadingProgress,
  ReadingBackupFile,
  ReaderSettings,
  ReaderTheme,
  ReaderFontFamily,
  TtsState,
  TtsStatus,
} from './state.types';

export { DEFAULT_READER_SETTINGS } from './state.types';
