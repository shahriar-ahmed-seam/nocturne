/**
 * useLibraryScanner — drives the background SAF directory scan.
 *
 * Delegates the heavy lifting to LibraryScanService, keeping this hook
 * focused on React lifecycle and concurrency control.
 *
 * Usage:
 * ```tsx
 * const { scan, isScanning } = useLibraryScanner();
 * await scan();
 * ```
 */

import { useCallback, useRef } from 'react';
import { useLibraryStore } from '../store/libraryStore';
import { scanLibraryTree } from '../services/LibraryScanService';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useLibraryScanner() {
  const treeUri = useLibraryStore((s) => s.treeUri);
  const isScanning = useLibraryStore((s) => s.library?.isScanning ?? false);
  const upsertNovel = useLibraryStore((s) => s.upsertNovel);
  const setScanning = useLibraryStore((s) => s.setScanning);

  // Prevent concurrent scans
  const scanningRef = useRef(false);

  const scan = useCallback(async () => {
    if (!treeUri || scanningRef.current) return;
    scanningRef.current = true;
    setScanning(true);

    try {
      await scanLibraryTree(treeUri, (novel) => {
        upsertNovel(novel);
      });
    } catch (e) {
      console.error('[Scanner] Scan failed:', e);
    } finally {
      setScanning(false);
      scanningRef.current = false;
    }
  }, [treeUri, upsertNovel, setScanning]);

  return { scan, isScanning };
}
