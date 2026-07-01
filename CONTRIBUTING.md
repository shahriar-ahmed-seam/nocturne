# Contributing to Nocturne

Thanks for your interest in improving Nocturne! This guide covers the essentials.

## Development setup

```bash
npm install
npm run start          # Metro bundler
npm run android        # build & run on a device/emulator
```

## Before you open a PR

Both gates must pass:

```bash
npm run type-check     # tsc --noEmit — strict, zero errors
npm run lint           # eslint — zero errors
```

Code is formatted with Prettier (`.prettierrc`). Run it on your changes:

```bash
npx prettier --write "src/**/*.{ts,tsx}"
```

## Conventions

- **TypeScript strict mode** — no `any` escape hatches. Branded types (`SafUri`, `NovelId`) are used deliberately; keep them.
- **Storage boundary** — all file I/O for the user's library goes through `ISafStorageService` and returns `SafResult<T>`. Never throw across that boundary, and never import `react-native-fs` for library files.
- **Services are singletons**; React hooks compose them. Keep business logic out of components.
- **Commits** — Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`).

## Branching

- Branch from `main` (`feat/…`, `fix/…`).
- Open a PR with a short summary of what changed and how you tested it.
- Never force-push shared branches.

## Reporting bugs

Open an issue with your device/Android version, steps to reproduce, and (if relevant) the structure of the library folder that triggered it.
