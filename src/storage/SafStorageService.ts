/**
 * SafStorageService — Production implementation of ISafStorageService.
 *
 * Wraps `react-native-saf-x` for all SAF tree operations and the custom
 * `ChunkReaderModule` native bridge for chunked streaming reads.
 *
 * ┌──────────────────────────────────┐
 * │        JS consumers              │
 * │  (stores, screens, hooks)        │
 * └──────────┬───────────────────────┘
 *            │ ISafStorageService
 * ┌──────────▼───────────────────────┐
 * │      SafStorageService           │   ← this file
 * │  ┌───────────┐  ┌─────────────┐  │
 * │  │ saf-x     │  │ ChunkReader │  │
 * │  │ (SAF ops) │  │ (native)    │  │
 * │  └───────────┘  └─────────────┘  │
 * └──────────────────────────────────┘
 *
 * All methods return `SafResult<T>` — no thrown exceptions cross this boundary.
 */

import {
  openDocumentTree,
  listFiles,
  readFile,
  mkdir as safMkdir,
  writeFile as safWriteFile,
  exists as safExists,
  getPersistedUriPermissions,
  releasePersistableUriPermission,
  type DocumentFileDetail,
} from 'react-native-saf-x';
import ReactNativeBlobUtil from 'react-native-blob-util';

import type {
  SafUri,
  SafDocumentFile,
  ChunkReaderConfig,
  PersistedTreePermission,
} from '../types/saf.types';
import { toSafUri } from '../types/saf.types';

import type { ISafStorageService, IChunkReader, SafResult } from './ISafStorageService';
import { safOk, safErr } from './ISafStorageService';

import { ChunkReader } from './ChunkReader';

// ---------------------------------------------------------------------------
// Singleton service
// ---------------------------------------------------------------------------

export class SafStorageService implements ISafStorageService {
  private static instance: SafStorageService | null = null;

  static getInstance(): SafStorageService {
    if (!SafStorageService.instance) {
      SafStorageService.instance = new SafStorageService();
    }
    return SafStorageService.instance;
  }

  // Private constructor — use getInstance()
  private constructor() {}

  // ─── Permission Management ──────────────────────────────────────────────

  async requestLibraryPermission(): Promise<SafResult<PersistedTreePermission>> {
    try {
      const result = await openDocumentTree(true /* persistable */);

      if (!result || !result.uri) {
        return safErr('PERMISSION_DENIED', 'User cancelled the library folder picker.');
      }

      const permission: PersistedTreePermission = {
        treeUri: toSafUri(result.uri),
        grantedAt: new Date().toISOString(),
        isPersisted: true,
      };

      return safOk(permission);
    } catch (e: unknown) {
      return safErr(
        'PERMISSION_NOT_PERSISTED',
        `Failed to acquire persistable permission: ${errorMessage(e)}`,
        e,
      );
    }
  }

  async hasValidPermission(treeUri: SafUri): Promise<SafResult<boolean>> {
    try {
      const persisted = await getPersistedUriPermissions();
      const found = persisted.some((uri) => uri === (treeUri as string));
      return safOk(found);
    } catch (e: unknown) {
      return safErr('UNKNOWN', `Permission check failed: ${errorMessage(e)}`, e);
    }
  }

  async releasePermission(treeUri: SafUri): Promise<SafResult<void>> {
    try {
      await releasePersistableUriPermission(treeUri as string);
      return safOk(undefined);
    } catch (e: unknown) {
      return safErr('UNKNOWN', `Release permission failed: ${errorMessage(e)}`, e);
    }
  }

  // ─── Directory Operations ────────────────────────────────────────────────

  async listDirectory(dirUri: SafUri): Promise<SafResult<SafDocumentFile[]>> {
    try {
      const raw = await listFiles(dirUri as string);
      const mapped: SafDocumentFile[] = raw.map(mapNativeDoc);
      return safOk(mapped);
    } catch (e: unknown) {
      return safErr(
        'DIRECTORY_NOT_FOUND',
        `listDirectory failed for ${dirUri}: ${errorMessage(e)}`,
        e,
      );
    }
  }

  async resolveChild(parentUri: SafUri, childName: string): Promise<SafResult<SafDocumentFile>> {
    const listResult = await this.listDirectory(parentUri);
    if (!listResult.ok) return listResult;

    const match = listResult.value.find((f) => f.name.toLowerCase() === childName.toLowerCase());
    if (!match) {
      return safErr('FILE_NOT_FOUND', `Child "${childName}" not found in ${parentUri}`);
    }
    return safOk(match);
  }

  async exists(uri: SafUri): Promise<SafResult<boolean>> {
    try {
      const result = await safExists(uri as string);
      return safOk(result);
    } catch (e: unknown) {
      return safErr('UNKNOWN', `exists() failed: ${errorMessage(e)}`, e);
    }
  }

  // ─── File Reading ───────────────────────────────────────────────────────

  async readSmallFile(
    uri: SafUri,
    _encoding: 'utf-8' | 'utf-16le' = 'utf-8',
  ): Promise<SafResult<string>> {
    try {
      const content = await readFile(uri as string, { encoding: 'utf8' });
      return safOk(content);
    } catch (e: unknown) {
      return safErr('READ_ERROR', `readSmallFile failed for ${uri}: ${errorMessage(e)}`, e);
    }
  }

  async createChunkReader(
    uri: SafUri,
    config?: Partial<ChunkReaderConfig>,
    fromByte?: number,
  ): Promise<SafResult<IChunkReader>> {
    return ChunkReader.create(uri, config, fromByte);
  }

  // ─── File Writing ───────────────────────────────────────────────────────

  async writeFile(uri: SafUri, content: string): Promise<SafResult<void>> {
    try {
      await safWriteFile(uri as string, content, { encoding: 'utf8' });
      return safOk(undefined);
    } catch (e: unknown) {
      return safErr('WRITE_ERROR', `writeFile failed for ${uri}: ${errorMessage(e)}`, e);
    }
  }

  async createFile(
    parentUri: SafUri,
    fileName: string,
    mimeType: string,
    content: string,
  ): Promise<SafResult<SafUri>> {
    try {
      // saf-x treats a tree URI like a path: `${dir}/${name}`. writeFile
      // transparently creates the file if it does not already exist.
      const childUri = joinSafUri(parentUri, fileName);
      await safWriteFile(childUri as string, content, {
        encoding: 'utf8',
        mimeType,
      });
      return safOk(childUri);
    } catch (e: unknown) {
      return safErr('WRITE_ERROR', `createFile failed for ${fileName}: ${errorMessage(e)}`, e);
    }
  }

  async createDirectory(parentUri: SafUri, dirName: string): Promise<SafResult<SafUri>> {
    try {
      const doc = await safMkdir(`${parentUri as string}/${dirName}`);
      if (!doc || !doc.uri) {
        return safErr('WRITE_ERROR', `createDirectory returned null for ${dirName}`);
      }
      return safOk(toSafUri(doc.uri));
    } catch (e: unknown) {
      return safErr('WRITE_ERROR', `createDirectory failed for ${dirName}: ${errorMessage(e)}`, e);
    }
  }

  // ─── SAF Copy (Cloud Downloader) ───────────────────────────────────────

  async copyFromCacheToSaf(
    sourceCachePath: string,
    destDirUri: SafUri,
    _overwrite: boolean = false,
  ): Promise<SafResult<SafUri>> {
    try {
      // Extract the filename from the cache path
      const segments = sourceCachePath.replace(/\\/g, '/').split('/');
      const fileName = segments[segments.length - 1] ?? 'unknown';

      // Read the cached file as base64 (lossless for both text and binary)
      // and write it into the SAF tree via a base64-encoded write.
      const base64 = await ReactNativeBlobUtil.fs.readFile(sourceCachePath, 'base64');
      const childUri = joinSafUri(destDirUri, fileName);
      await safWriteFile(childUri as string, base64, { encoding: 'base64' });

      return safOk(childUri);
    } catch (e: unknown) {
      return safErr('WRITE_ERROR', `copyFromCacheToSaf failed: ${errorMessage(e)}`, e);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Join a SAF tree/directory URI with a child name (saf-x path semantics). */
function joinSafUri(dirUri: SafUri, childName: string): SafUri {
  return toSafUri(`${dirUri as string}/${childName}`);
}

/**
 * Map the raw object returned by react-native-saf-x's `listFiles`
 * into our strictly-typed `SafDocumentFile`.
 */
function mapNativeDoc(raw: DocumentFileDetail): SafDocumentFile {
  const isDirectory = raw.type === 'directory';
  return {
    uri: toSafUri(raw.uri),
    name: raw.name ?? '',
    mimeType: raw.mime ?? 'application/octet-stream',
    isDirectory,
    isFile: !isDirectory,
    size: raw.size ?? -1,
    lastModified: raw.lastModified ?? 0,
  };
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
