/**
 * NativeChunkReader — TypeScript bridge to the Kotlin ChunkReaderModule.
 *
 * This module exposes strongly-typed wrappers around the native methods.
 * It is the ONLY file in the app that imports `NativeModules` for chunk
 * reading; every other consumer goes through `IChunkReader`.
 */

import { NativeModules } from 'react-native';

// ---------------------------------------------------------------------------
// Raw native return shapes (mirrors the WritableMap from Kotlin)
// ---------------------------------------------------------------------------

interface NativeOpenResult {
  sessionId: string;
  /** Returned as a JS number (from Kotlin Double). */
  totalBytes: number;
}

interface NativeChunkResult {
  startOffset: number;
  endOffset: number;
  text: string;
  isEof: boolean;
}

// ---------------------------------------------------------------------------
// Typed wrapper
// ---------------------------------------------------------------------------

interface ChunkReaderNativeInterface {
  openStream(uri: string, chunkSize: number): Promise<NativeOpenResult>;
  readChunk(sessionId: string): Promise<NativeChunkResult>;
  seekStream(sessionId: string, byteOffset: number): Promise<null>;
  closeStream(sessionId: string): Promise<null>;
  getFileSize(uri: string): Promise<number>;
}

const NativeChunkReader: ChunkReaderNativeInterface = NativeModules.ChunkReaderModule;

if (!NativeChunkReader) {
  throw new Error(
    '[ChunkReaderModule] Native module not linked. ' +
      'Did you add ChunkReaderPackage to MainApplication?',
  );
}

export type { NativeOpenResult, NativeChunkResult };
export { NativeChunkReader };
