<div align="center">

<img src="src/assets/onboarding/hero-lights.jpg" alt="Nocturne" width="100%" />

# 🌙 Nocturne

### Read the night away.

**A cinematic, offline-first novel reader for Android — built for power readers with big local libraries.**

Stream 50 MB+ chapter files without stutter, own your reading data, and never sign in to anything.

<p>
  <img alt="Platform" src="https://img.shields.io/badge/platform-Android-3ddc84?logo=android&logoColor=white" />
  <img alt="React Native" src="https://img.shields.io/badge/React%20Native-0.73-61dafb?logo=react&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white" />
  <img alt="Kotlin" src="https://img.shields.io/badge/native-Kotlin-7f52ff?logo=kotlin&logoColor=white" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-black" />
</p>

</div>

---

## Why Nocturne?

Most reading apps assume your books live in *their* cloud. Nocturne assumes the opposite: **your library is a folder you control.** Point it at any folder of `.txt` chapters — on internal storage, an SD card, or a synced drive — and Nocturne indexes it, remembers your place, and gets out of the way.

It's engineered for the reader who follows 400-chapter web serials, keeps decade-spanning archives, and wants a reading surface that feels like a premium e-ink app but runs on any phone.

| | |
|---|---|
| 🗂️ **No account, no cloud lock-in** | Your novels and progress live in *your* folder via Android's Storage Access Framework. |
| ⚡ **Handles enormous files** | A custom Kotlin streaming engine reads chapters in 64 KB slices — 50 MB+ files open instantly, zero out-of-memory crashes. |
| 📖 **A reading surface you'll actually enjoy** | Four themes, four typefaces, adjustable brightness, line height, spacing, and hands-free auto-scroll. |
| 🔊 **Listen when you can't look** | Built-in text-to-speech with auto-advance and live paragraph highlighting. |
| 🔖 **Progress that travels** | Position and bookmarks are written to a portable JSON file in your library root — copy the folder to a new phone and pick up mid-sentence. |

---

## Features

### Reading experience
- **Immersive reader** — full-screen, tap-to-toggle chrome, swipe between chapters.
- **Four themes** — Light, Dark, Sepia, and true-black AMOLED, each with tuned reading surfaces.
- **Typography control** — System / Serif / Sans / Mono typefaces, font size, line height, and paragraph spacing.
- **Auto-scroll** — hands-free reading at an adjustable speed (10–160 px/s).
- **In-reader brightness** — dim the screen for late-night reading without leaving the app.
- **Text-to-speech** — play/pause, speed and pitch control, auto-advance through paragraphs with the active line highlighted.
- **Bookmarks** — save any paragraph with a context snippet; browse, jump to, and manage them per novel.

### Library & data
- **SAF library** — grant access to one folder; permission survives reboots. No `MANAGE_EXTERNAL_STORAGE`.
- **Fast grid** — virtualized 3-column cover grid (`@shopify/flash-list`) with fuzzy search and sort (Recent / A–Z / Chapter count).
- **Portable backup** — `reading_backup.json` in the library root carries progress + bookmarks between devices.
- **Cloud import** — pull a `.zip` of novels from a URL and unpack it straight into your library.
- **Cinematic onboarding** — a first-run walkthrough that hands off to the folder picker.

### Under the hood
- **Native chunked reader** (Kotlin) with **byte-accurate UTF-8 boundary correction** — multi-byte characters are never split across chunks.
- **Streaming paragraph parser** that buffers incomplete paragraphs across chunk boundaries.
- **Bounded-memory sliding window** — while reading a huge single chapter, far-behind paragraphs have their text released to cap memory; their byte offsets and (measured) heights are kept, so scrolling never jumps and revisited paragraphs re-hydrate from disk on demand.
- **Dual position anchor** — every position is stored as both a `byteOffset` (for seeking) and a `paragraphIndex` (for scrolling), so resume survives font changes and reinstalls.

---

## Library layout

Point Nocturne at a folder shaped like this:

```
[Library Root]/
├── reading_backup.json          ← created & maintained by the app
├── The Wandering Inn/
│   ├── cover.jpg                 ← optional (jpg / png / webp)
│   ├── description.txt           ← optional synopsis
│   └── chapters/
│       ├── Chapter 1 {A Girl}.txt
│       ├── Chapter 2 {A Human}.txt
│       └── ...
└── Another Novel/            ← loose .txt files also work (no chapters/ needed)
    ├── Chapter 1.txt
    └── Chapter 2.txt
```

- Each top-level folder is one novel (folder name = title).
- Chapters are UTF-8 `.txt` files, natural-sorted by filename. Nocturne looks
  for a `chapters/` subfolder first; if there isn't one, it treats the loose
  `.txt` files sitting directly in the novel folder as the chapters.
- `cover.(jpg|png|webp)` and `description.txt` are optional.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                 React Native · TypeScript                 │
│  Screens ── Hooks ── Components                            │
│      │        │                                           │
│  ┌───▼────────▼──────────────┐   Zustand + Immer stores   │
│  │  libraryStore · readingStore │  (structural sharing)    │
│  └───────────┬────────────────┘                           │
│              │  Services (Backup · Tts · Download · MMKV)  │
│  ┌───────────▼────────────────┐                           │
│  │  SafStorageService (single) │  → SafResult<T>, no throw │
│  │   saf-x  ·  ChunkReader     │                           │
│  └───────────┬────────────────┘                           │
├──────────────┼────────────────────────────────────────────┤
│              ▼        Android · Kotlin                     │
│  ChunkReaderModule — streamed 64 KB reads from a SAF       │
│  InputStream + findUtf8SafeBoundary() correction          │
└──────────────────────────────────────────────────────────┘
```

**Design rules the codebase enforces:**
- Every storage call returns a `SafResult<T>` discriminated union — no exceptions cross the storage boundary.
- Branded types (`SafUri`, `NovelId`) prevent string mix-ups at compile time.
- Services are singletons; hooks compose them for the React lifecycle.
- TypeScript runs in strict mode with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for a deeper tour.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | React Native CLI 0.73 (Hermes) |
| Language | TypeScript 5 (strict) + Kotlin (native module) |
| Navigation | React Navigation 6 (stack) |
| State | Zustand 4 + Immer |
| Lists | `@shopify/flash-list` |
| Fast storage | `react-native-mmkv` |
| Animation / gesture | Reanimated 3 · Gesture Handler |
| Storage access | `react-native-saf-x` + custom `ChunkReaderModule` |
| TTS | `react-native-tts` |
| Downloads | `react-native-blob-util` |

---

## Getting started

**Prerequisites:** Node ≥ 18 · JDK 17 · Android SDK (API 34 compile / API 24 min) · an Android device or emulator.

```bash
# 1. Install dependencies
npm install

# 2. Start Metro
npm run start

# 3. Build & run on a connected device (in a second terminal)
npm run android
```

On first launch you'll see the onboarding walkthrough, then a prompt to choose your library folder. Pick your novels folder and Nocturne scans it automatically.

### Quality gates

```bash
npm run type-check   # tsc --noEmit (strict)
npm run lint         # eslint
```

### Release build

```bash
npm run build:android
# → android/app/build/outputs/apk/release/app-release.apk
```

> The bundled config signs release builds with the debug keystore for easy sideloading. For a Play Store submission, configure a real `signingConfig` in `android/app/build.gradle`.

---

## Credits

Onboarding photography from [Unsplash](https://unsplash.com/license) — see [`src/assets/onboarding/CREDITS.md`](src/assets/onboarding/CREDITS.md) for per-image attribution.

## License

[MIT](LICENSE) © Shahriar Ahmed
