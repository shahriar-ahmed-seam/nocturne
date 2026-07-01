/**
 * useTts — drives Text-to-Speech playback for the reader.
 *
 * Manages:
 *   - Sequential paragraph speaking with auto-advance
 *   - Highlighted paragraph synced to Zustand readingStore
 *   - Rate, pitch, and voice application from ReaderSettings
 *   - Clean teardown on unmount
 *
 * Usage in ReaderScreen:
 * ```tsx
 * const { toggleTts, stopTts, isSpeaking, isPaused } = useTts();
 * ```
 */

import { useCallback, useEffect, useRef } from 'react';
import { useReadingStore } from '../store/readingStore';
import { TtsService } from '../services/TtsService';

export function useTts() {
  const paragraphs = useReadingStore((s) => s.paragraphs);
  const ttsState = useReadingStore((s) => s.tts);
  const settings = useReadingStore((s) => s.settings);
  const setTtsState = useReadingStore((s) => s.setTtsState);

  const ttsRef = useRef(TtsService.getInstance());
  const speakingIndexRef = useRef<number | null>(null);
  /** Flag to track whether we're actively speaking through paragraphs. */
  const activeRef = useRef(false);

  // ── Apply rate / pitch from settings whenever they change ────────────────
  useEffect(() => {
    const tts = ttsRef.current;
    tts.setRate(settings.ttsSpeed);
    tts.setPitch(settings.ttsPitch);
  }, [settings.ttsSpeed, settings.ttsPitch]);

  // ── Apply voice ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (settings.ttsVoiceId) {
      void ttsRef.current.setVoice(settings.ttsVoiceId);
    }
  }, [settings.ttsVoiceId]);

  // ── Wire up callbacks ───────────────────────────────────────────────────
  useEffect(() => {
    const tts = ttsRef.current;

    tts.setCallbacks({
      onStart: () => {
        setTtsState({ status: 'playing' });
      },
      onFinish: () => {
        // Auto-advance to next paragraph
        const idx = speakingIndexRef.current;
        if (idx === null || !activeRef.current) return;

        const nextIdx = idx + 1;
        const store = useReadingStore.getState();
        if (nextIdx < store.paragraphs.length) {
          speakingIndexRef.current = nextIdx;
          setTtsState({ activeParagraphIndex: nextIdx });
          void tts.speak(store.paragraphs[nextIdx]!);
        } else {
          // Reached the end of loaded paragraphs
          activeRef.current = false;
          speakingIndexRef.current = null;
          setTtsState({
            status: 'idle',
            activeParagraphIndex: null,
          });
        }
      },
      onCancel: () => {
        if (!activeRef.current) {
          setTtsState({ status: 'idle', activeParagraphIndex: null });
        }
      },
      onError: (err) => {
        activeRef.current = false;
        speakingIndexRef.current = null;
        setTtsState({
          status: 'error',
          activeParagraphIndex: null,
          errorMessage: err.message ?? 'TTS engine error',
        });
      },
    });

    return () => {
      tts.removeCallbacks();
    };
  }, [setTtsState]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    const tts = ttsRef.current;
    return () => {
      activeRef.current = false;
      void tts.stop();
      tts.removeCallbacks();
      setTtsState({ status: 'idle', activeParagraphIndex: null });
    };
  }, [setTtsState]);

  // ── Public actions ──────────────────────────────────────────────────────

  /**
   * Start speaking from the currently visible paragraph, or resume
   * from where we left off. If already playing, pause.
   */
  const toggleTts = useCallback(async () => {
    const tts = ttsRef.current;

    if (ttsState.status === 'playing') {
      // Pause (stop + keep index)
      activeRef.current = false;
      await tts.stop();
      setTtsState({ status: 'paused' });
      return;
    }

    // Determine starting paragraph
    let startIdx: number;
    if (ttsState.status === 'paused' && speakingIndexRef.current !== null) {
      // Resume from where we paused
      startIdx = speakingIndexRef.current;
    } else {
      // Start from currently visible paragraph
      startIdx = useReadingStore.getState().visibleParagraphIndex;
    }

    const text = paragraphs[startIdx];
    if (!text) return;

    activeRef.current = true;
    speakingIndexRef.current = startIdx;
    setTtsState({
      status: 'loading',
      activeParagraphIndex: startIdx,
      errorMessage: null,
    });

    await tts.init();
    tts.setRate(settings.ttsSpeed);
    tts.setPitch(settings.ttsPitch);
    await tts.speak(text);
  }, [ttsState.status, paragraphs, settings.ttsSpeed, settings.ttsPitch, setTtsState]);

  /**
   * Stop TTS completely and reset highlight.
   */
  const stopTts = useCallback(async () => {
    activeRef.current = false;
    speakingIndexRef.current = null;
    await ttsRef.current.stop();
    setTtsState({ status: 'idle', activeParagraphIndex: null });
  }, [setTtsState]);

  /**
   * Skip to a specific paragraph and start speaking from there.
   */
  const speakFromIndex = useCallback(
    async (index: number) => {
      const text = paragraphs[index];
      if (!text) return;

      const tts = ttsRef.current;
      await tts.stop();
      activeRef.current = true;
      speakingIndexRef.current = index;
      setTtsState({
        status: 'loading',
        activeParagraphIndex: index,
        errorMessage: null,
      });

      await tts.init();
      await tts.speak(text);
    },
    [paragraphs, setTtsState],
  );

  return {
    toggleTts,
    stopTts,
    speakFromIndex,
    isSpeaking: ttsState.status === 'playing',
    isPaused: ttsState.status === 'paused',
    isLoading: ttsState.status === 'loading',
    ttsStatus: ttsState.status,
    activeParagraphIndex: ttsState.activeParagraphIndex,
  };
}
