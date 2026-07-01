## 🌙 Nocturne v1.0.0

The first public release of **Nocturne** — a cinematic, offline-first novel reader for Android.

### Highlights
- **Native chunked reader** (Kotlin) streams 50 MB+ chapter files in 64 KB slices with byte-accurate UTF-8 boundary correction — no out-of-memory crashes.
- **Own your library** — grant access to a folder via Android's Storage Access Framework; permission survives reboots. No account, no cloud.
- **Immersive reading** — 4 themes (Light / Dark / Sepia / AMOLED), 4 typefaces, adjustable brightness, line height, spacing, and hands-free **auto-scroll**.
- **Text-to-speech** with auto-advance and live paragraph highlighting.
- **Bookmarks** — save, browse, and jump to any paragraph, per novel.
- **Portable progress** — position + bookmarks live in `reading_backup.json` in your library root; copy the folder to a new device and continue mid-sentence.
- **Cinematic onboarding** first-run experience.

### Quality
- ✅ `tsc --noEmit` (strict TypeScript) — **0 errors**
- ✅ `eslint` — **0 errors**
- ✅ Gradle release build configured (Hermes, debug-signed for sideloading)

### Building an APK
This source release does not ship a prebuilt APK. To produce one:

```bash
npm install
npm run build:android
# → android/app/build/outputs/apk/release/app-release.apk
```

**Build requirements:** JDK 17 and Android SDK (API 34). Build from a path **without special characters** — Android's native (CMake/NDK) toolchain and the Gradle wrapper do not handle characters like `&` or `#` in the project's absolute path.

### Notes
Onboarding imagery courtesy of [Unsplash](https://unsplash.com/license) (see `src/assets/onboarding/CREDITS.md`).
