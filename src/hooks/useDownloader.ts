/**
 * useDownloader — manages novel download from URL.
 *
 * Wraps DownloadService pipeline and updates a local progress state
 * that the DownloadScreen renders.
 *
 * Usage:
 * ```tsx
 * const { startDownload, progress, isActive } = useDownloader();
 * ```
 */

import { useCallback, useState } from 'react';
import { useLibraryStore } from '../store/libraryStore';
import { downloadAndImportNovel, type DownloadProgress } from '../services/DownloadService';

const IDLE: DownloadProgress = {
  status: 'idle',
  progress: 0,
  totalBytes: -1,
  receivedBytes: 0,
  message: '',
};

export function useDownloader() {
  const [progress, setProgress] = useState<DownloadProgress>(IDLE);
  const treeUri = useLibraryStore((s) => s.treeUri);
  const scanLibrary = useLibraryStore((s) => s.scanLibrary);

  const startDownload = useCallback(
    async (url: string) => {
      if (!treeUri) {
        setProgress({
          ...IDLE,
          status: 'error',
          message: 'No library folder selected',
          errorMessage: 'Please select a library folder first from the Library tab.',
        });
        return;
      }

      setProgress(IDLE);

      try {
        await downloadAndImportNovel(url, treeUri, (p) => {
          setProgress(p);
        });

        // After successful import, re-scan library
        await scanLibrary();
      } catch {
        // Error already set via progress callback
      }
    },
    [treeUri, scanLibrary],
  );

  const reset = useCallback(() => setProgress(IDLE), []);

  return {
    startDownload,
    progress,
    reset,
    isActive:
      progress.status !== 'idle' && progress.status !== 'done' && progress.status !== 'error',
  };
}
