/**
 * TtsService — singleton wrapper over react-native-tts.
 *
 * Provides:
 *   - Lazy initialization (engine is allocated on first `speak()`)
 *   - Rate / pitch / voice configuration
 *   - Event forwarding (start, finish, cancel, error) via callbacks
 *   - Graceful teardown
 *
 * The companion `useTts` hook consumes this service and wires paragraph
 * highlighting back into the Zustand reading store.
 */

import Tts, { type Voice } from 'react-native-tts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TtsCallbacks {
  onStart?: (utteranceId: string | number) => void;
  onFinish?: (utteranceId: string | number) => void;
  onCancel?: (utteranceId: string | number) => void;
  onError?: (error: { message: string }) => void;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class TtsService {
  private static instance: TtsService | null = null;
  private initialized = false;
  private callbacks: TtsCallbacks = {};

  static getInstance(): TtsService {
    if (!TtsService.instance) {
      TtsService.instance = new TtsService();
    }
    return TtsService.instance;
  }

  private constructor() {}

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  /**
   * Initialize the TTS engine. Safe to call multiple times —
   * subsequent calls are no-ops.
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      await Tts.getInitStatus();
    } catch {
      // On some devices getInitStatus throws — engine still works
      console.warn('[TTS] getInitStatus threw; attempting to continue');
    }

    // Defaults
    Tts.setDefaultRate(1.0, true);
    Tts.setDefaultPitch(1.0);
    Tts.setIgnoreSilentSwitch('ignore');
    Tts.setDucking(true);

    // Wire native events to our callbacks
    Tts.addEventListener('tts-start', (evt) => {
      this.callbacks.onStart?.(evt.utteranceId);
    });
    Tts.addEventListener('tts-finish', (evt) => {
      this.callbacks.onFinish?.(evt.utteranceId);
    });
    Tts.addEventListener('tts-cancel', (evt) => {
      this.callbacks.onCancel?.(evt.utteranceId);
    });
    Tts.addEventListener('tts-error', (evt) => {
      const message = (evt as unknown as { message?: string }).message ?? 'TTS engine error';
      this.callbacks.onError?.({ message });
    });

    this.initialized = true;
  }

  // ─── Configuration ──────────────────────────────────────────────────────

  setRate(rate: number): void {
    Tts.setDefaultRate(Math.max(0.1, Math.min(3.0, rate)), true);
  }

  setPitch(pitch: number): void {
    Tts.setDefaultPitch(Math.max(0.5, Math.min(2.0, pitch)));
  }

  async setVoice(voiceId: string): Promise<void> {
    await Tts.setDefaultVoice(voiceId);
  }

  async getVoices(): Promise<Voice[]> {
    await this.init();
    return Tts.voices();
  }

  // ─── Playback ───────────────────────────────────────────────────────────

  /**
   * Speak a paragraph. Returns an utterance ID that will be
   * forwarded to onStart / onFinish callbacks.
   */
  async speak(text: string): Promise<string | number> {
    await this.init();
    // Tts.speak returns the utteranceId synchronously (Android STREAM_MUSIC).
    return Tts.speak(text);
  }

  async stop(): Promise<void> {
    await Tts.stop();
  }

  /** Android does not support pause natively; we stop instead. */
  async pause(): Promise<void> {
    await Tts.stop();
  }

  // ─── Callbacks ──────────────────────────────────────────────────────────

  setCallbacks(callbacks: TtsCallbacks): void {
    this.callbacks = callbacks;
  }

  removeCallbacks(): void {
    this.callbacks = {};
  }

  // ─── Teardown ───────────────────────────────────────────────────────────

  dispose(): void {
    Tts.removeAllListeners('tts-start');
    Tts.removeAllListeners('tts-finish');
    Tts.removeAllListeners('tts-cancel');
    Tts.removeAllListeners('tts-error');
    this.callbacks = {};
    this.initialized = false;
  }
}
