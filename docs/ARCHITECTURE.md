# Architecture

Nocturne is a React Native (TypeScript) app with a single custom Kotlin native
module. It is offline-first: the only "backend" is a folder the user grants
access to via Android's Storage Access Framework (SAF).

## Layers

```
Screens / Components  →  Hooks  →  Zustand stores  →  Services  →  SafStorageService  →  Kotlin ChunkReaderModule
```

### 1. Types (`src/types`)
Branded types make illegal states unrepresentable at compile time:
- `SafUri` — an opaque `content://` string (never a POSIX path).
- `NovelId` — a slugified, URL-safe novel identifier.
- `SafResult<T>` — a discriminated union returned by every storage call, so no
  exception ever crosses the storage boundary.

### 2. Storage (`src/storage`)
- **`ISafStorageService`** — the canonical interface. All library file I/O goes
  through it.
- **`SafStorageService`** — production singleton wrapping `react-native-saf-x`
  and the native chunk reader.
- **`ChunkReader`** — exposes the native module as an `AsyncIterable<FileChunk>`.
- **`ParagraphParser`** — a stateful streaming transformer that turns raw chunks
  into complete paragraphs, buffering incomplete text across chunk boundaries
  and force-splitting pathologically long paragraphs.

### 3. Native module (`android/.../chunkreader`)
`ChunkReaderModule.kt` streams a SAF `InputStream` in fixed 64 KB slices:
- `openStream` / `readChunk` / `seekStream` / `closeStream`
- `findUtf8SafeBoundary()` scans backward from the chunk end to a complete
  UTF-8 character boundary; leftover bytes are carried into the next read.
- Sessions are tracked in a `ConcurrentHashMap` and torn down on Catalyst
  instance destroy.

Because SAF `InputStream`s are not randomly seekable, `seek` closes and reopens
the stream, then `skip`s to the target offset.

### 4. State (`src/store`)
Two Zustand stores with Immer middleware:
- **`libraryStore`** — tree URI (persisted in MMKV), the novel index, scan
  lifecycle, and filter/sort state.
- **`readingStore`** — the active session, the incrementally-populated paragraph
  array, reader settings (MMKV), TTS runtime state, and the per-novel progress
  map (mirrored to `reading_backup.json`).

`castDraft` bridges the app's deeply-`readonly` domain types with Immer's
mutable drafts without loosening the public types.

### 5. Services (`src/services`)
Non-React business logic: `BackupService`, `LibraryScanService`, `TtsService`,
`DownloadService`, and `SettingsService` (MMKV).

## Persistence strategy

| Data | Store | Why |
|------|-------|-----|
| Reader settings (theme, font, brightness, TTS) | MMKV | Device-specific, sub-ms reads on every frame |
| Library tree URI + onboarding flag | MMKV | Must survive cold start |
| Reading progress + bookmarks | `reading_backup.json` (SAF root) | Portable across devices |

## The dual position anchor

Every saved position records both:
- `byteOffset` — the seek point for the native reader (survives reinstalls).
- `paragraphIndex` — the scroll target for the virtualized list (survives font
  changes and rotation, which re-flow text).

## Reading pipeline

```
ChunkReader (native, 64 KB) → ParagraphParser.ingest() → readingStore.appendParagraphs() → FlashList
```

`useChapterReader` drives batches of chunks on `onEndReached`; `useTts` walks the
same paragraph array for hands-free playback.
