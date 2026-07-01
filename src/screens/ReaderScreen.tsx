/**
 * ReaderScreen — immersive, distraction-free reading interface.
 *
 * Features:
 *   - Full-screen mode; tap centre toggles header/footer overlays
 *   - Virtualized paragraph rendering via FlashList (fed by ChunkReader)
 *   - Swipe left/right for next/prev chapter
 *   - Smart side-drawer (left swipe) with chapter list + bookmarks
 *   - Typography controls (font size, line height, spacing, theme)
 *   - Auto-save position (debounced 5 s)
 *   - FlashList onEndReached → lazyChunkLoader
 */

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  StatusBar,
  AppState,
  type AppStateStatus,
  type ViewToken,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReadingStore } from '../store/readingStore';
import { useLibraryStore } from '../store/libraryStore';
import { useTheme } from '../hooks/useTheme';
import { useChapterReader } from '../hooks/useChapterReader';
import { useTts } from '../hooks/useTts';

import type { Chapter, NovelId } from '../types/library.types';
import type { ScreenProps } from '../navigation/types';
import type { ReaderTheme, ReaderFontFamily } from '../types/state.types';
import { SPACING, RADIUS, getPalette, FONT_FAMILY_MAP, FONT_FAMILY_LABELS } from '../theme/colors';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTOSAVE_INTERVAL_MS = 5_000;
const AUTOSCROLL_TICK_MS = 50;
const THEME_OPTIONS: { key: ReaderTheme; label: string }[] = [
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
  { key: 'sepia', label: 'Sepia' },
  { key: 'amoled', label: 'AMOLED' },
];
const FONT_OPTIONS: ReaderFontFamily[] = ['system', 'serif', 'sans', 'mono'];

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

const ReaderScreen: React.FC<ScreenProps<'Reader'>> = ({ route, navigation }) => {
  const palette = useTheme();
  const insets = useSafeAreaInsets();
  const { novelId, chapter } = route.params;

  // ── Store slices ─────────────────────────────────────────────────────────
  const paragraphs = useReadingStore((s) => s.paragraphs);
  const settings = useReadingStore((s) => s.settings);
  const isLoadingChunk = useReadingStore((s) => s.isLoadingChunk);
  const visibleParagraphIndex = useReadingStore((s) => s.visibleParagraphIndex);
  const setVisibleParagraphIndex = useReadingStore((s) => s.setVisibleParagraphIndex);
  const savePosition = useReadingStore((s) => s.savePosition);
  const persistProgress = useReadingStore((s) => s.persistProgress);
  const updateSettings = useReadingStore((s) => s.updateSettings);
  const addBookmark = useReadingStore((s) => s.addBookmark);

  // ── TTS ──────────────────────────────────────────────────────────────────
  const { toggleTts, stopTts, isSpeaking, isPaused } = useTts();

  // ── Novel & chapters for swipe navigation ────────────────────────────────
  const novel = useLibraryStore((s) => s.library?.novels[novelId as NovelId]);
  const chapters = useMemo(() => novel?.chapters ?? [], [novel]);
  const currentChapterIndex = useMemo(
    () => chapters.findIndex((c) => c.id === chapter.id),
    [chapters, chapter],
  );

  // ── Chunk reader ─────────────────────────────────────────────────────────
  const { loadInitial, loadMore, cleanup, getCurrentByteOffset } = useChapterReader();

  // ── UI state ─────────────────────────────────────────────────────────────
  const [showOverlay, setShowOverlay] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [autoScroll, setAutoScroll] = useState(false);
  const listRef = useRef<FlashList<string>>(null);
  const scrollOffsetRef = useRef(0);
  const overlayOpacity = useSharedValue(0);

  // ── Load chapter on mount / chapter change ──────────────────────────────
  useEffect(() => {
    const progress = useReadingStore.getState().progressMap[novelId as NovelId];
    const fromByte = progress?.lastReadChapterUri === chapter.uri ? progress.byteOffset : 0;

    // Clear current paragraphs
    useReadingStore.setState({ paragraphs: [], visibleParagraphIndex: 0 });
    useReadingStore.setState({
      activeNovelId: novelId,
      activeChapter: chapter,
    });

    void loadInitial(chapter, fromByte);

    return () => {
      void cleanup();
    };
  }, [chapter.uri]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-save on interval & app background ──────────────────────────────
  const persistPosition = useCallback(() => {
    const idx = useReadingStore.getState().visibleParagraphIndex;
    savePosition({
      chapterUri: chapter.uri,
      chapterFileName: chapter.fileName,
      paragraphIndex: idx,
      byteOffset: getCurrentByteOffset(),
      savedAt: Date.now(),
    });
    // Flush in-memory progress map to reading_backup.json on SAF
    void persistProgress();
  }, [chapter, savePosition, getCurrentByteOffset, persistProgress]);

  useEffect(() => {
    const interval = setInterval(persistPosition, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [persistPosition]);

  useEffect(() => {
    const handler = (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        persistPosition();
      }
    };
    const sub = AppState.addEventListener('change', handler);
    return () => sub.remove();
  }, [persistPosition]);

  // ── Auto-scroll (hands-free reading) ─────────────────────────────────────
  useEffect(() => {
    if (!autoScroll) return;
    const pxPerTick = (settings.autoScrollSpeed * AUTOSCROLL_TICK_MS) / 1000;
    const id = setInterval(() => {
      scrollOffsetRef.current += pxPerTick;
      listRef.current?.scrollToOffset({
        offset: scrollOffsetRef.current,
        animated: false,
      });
    }, AUTOSCROLL_TICK_MS);
    return () => clearInterval(id);
  }, [autoScroll, settings.autoScrollSpeed]);

  const handleListScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      // Keep our auto-scroll anchor in sync with manual scrolling.
      if (!autoScroll) {
        scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
      }
    },
    [autoScroll],
  );

  // ── Overlay toggle ───────────────────────────────────────────────────────
  const toggleOverlay = useCallback(() => {
    const next = !showOverlay;
    setShowOverlay(next);
    overlayOpacity.value = withTiming(next ? 1 : 0, { duration: 200 });
    if (!next) {
      setShowSettings(false);
    }
  }, [showOverlay, overlayOpacity]);

  const headerAnim = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
    pointerEvents: overlayOpacity.value > 0.5 ? 'auto' : 'none',
  }));
  const footerAnim = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
    pointerEvents: overlayOpacity.value > 0.5 ? 'auto' : 'none',
  }));

  // ── Chapter swipe gesture ────────────────────────────────────────────────
  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-30, 30])
    .onEnd((event) => {
      if (event.translationX < -80 && currentChapterIndex < chapters.length - 1) {
        // Swipe left → next chapter
        const nextChapter = chapters[currentChapterIndex + 1]!;
        persistPosition();
        navigation.push('Reader', { novelId, chapter: nextChapter });
      } else if (event.translationX > 80 && currentChapterIndex > 0) {
        // Swipe right → previous chapter
        const prevChapter = chapters[currentChapterIndex - 1]!;
        persistPosition();
        navigation.push('Reader', { novelId, chapter: prevChapter });
      }
    });

  // ── Viewability tracking (for saving paragraph index) ───────────────────
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 });
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0) {
      const first = viewableItems[0]!;
      if (typeof first.index === 'number') {
        setVisibleParagraphIndex(first.index);
      }
    }
  });

  // ── Render paragraph ────────────────────────────────────────────────────
  const renderParagraph = useCallback(
    ({ item, index }: { item: string; index: number }) => {
      const ttsIdx = useReadingStore.getState().tts.activeParagraphIndex;
      const isHighlighted = ttsIdx === index;

      return (
        <Text
          style={[
            styles.paragraph,
            {
              color: palette.readerText,
              fontFamily: FONT_FAMILY_MAP[settings.fontFamily],
              fontSize: settings.fontSize,
              lineHeight: settings.fontSize * settings.lineHeight,
              marginBottom: settings.paragraphSpacing,
              backgroundColor: isHighlighted ? palette.readerHighlight : 'transparent',
            },
          ]}
        >
          {item}
        </Text>
      );
    },
    [
      palette,
      settings.fontFamily,
      settings.fontSize,
      settings.lineHeight,
      settings.paragraphSpacing,
    ],
  );

  // ── Bookmark current position ────────────────────────────────────────────
  const handleBookmark = useCallback(() => {
    const idx = useReadingStore.getState().visibleParagraphIndex;
    const text = paragraphs[idx] ?? '';
    addBookmark({
      chapterUri: chapter.uri,
      chapterFileName: chapter.fileName,
      paragraphIndex: idx,
      snippet: text.slice(0, 120),
    });
  }, [chapter, paragraphs, addBookmark]);

  // ── Navigate to chapter from drawer ──────────────────────────────────────
  const handleDrawerChapter = useCallback(
    (ch: Chapter) => {
      setShowDrawer(false);
      persistPosition();
      navigation.push('Reader', { novelId, chapter: ch });
    },
    [novelId, navigation, persistPosition],
  );

  // ── Font size adjustment ─────────────────────────────────────────────────
  const adjustFontSize = useCallback(
    (delta: number) => {
      const next = Math.max(12, Math.min(32, settings.fontSize + delta));
      updateSettings({ fontSize: next });
    },
    [settings.fontSize, updateSettings],
  );

  const adjustLineHeight = useCallback(
    (delta: number) => {
      const next = Math.max(1.2, Math.min(2.5, +(settings.lineHeight + delta).toFixed(1)));
      updateSettings({ lineHeight: next });
    },
    [settings.lineHeight, updateSettings],
  );

  const adjustBrightness = useCallback(
    (delta: number) => {
      const next = Math.max(0.3, Math.min(1.0, +(settings.brightness + delta).toFixed(2)));
      updateSettings({ brightness: next });
    },
    [settings.brightness, updateSettings],
  );

  const adjustAutoScrollSpeed = useCallback(
    (delta: number) => {
      const next = Math.max(10, Math.min(160, settings.autoScrollSpeed + delta));
      updateSettings({ autoScrollSpeed: next });
    },
    [settings.autoScrollSpeed, updateSettings],
  );

  const openBookmarks = useCallback(() => {
    setShowDrawer(false);
    navigation.navigate('Bookmarks', { novelId });
  }, [navigation, novelId]);

  // ── Progress indicator ──────────────────────────────────────────────────
  const progressPct = useMemo(() => {
    if (paragraphs.length === 0) return 0;
    return Math.min(100, ((visibleParagraphIndex + 1) / paragraphs.length) * 100);
  }, [visibleParagraphIndex, paragraphs.length]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={[styles.root, { backgroundColor: palette.readerBg }]}>
        <StatusBar hidden={!showOverlay} barStyle={palette.statusBar} />

        {/* ── Main reading area ──────────────────────────────────────── */}
        <GestureDetector gesture={swipeGesture}>
          <Pressable style={styles.readArea} onPress={toggleOverlay}>
            <FlashList
              ref={listRef}
              data={paragraphs}
              renderItem={renderParagraph}
              keyExtractor={(_item, index) => `p-${index}`}
              estimatedItemSize={settings.fontSize * settings.lineHeight * 4}
              contentContainerStyle={{
                paddingHorizontal: SPACING.lg,
                paddingTop: insets.top + SPACING.md,
                paddingBottom: insets.bottom + 80,
              }}
              onEndReached={loadMore}
              onEndReachedThreshold={0.6}
              drawDistance={800}
              showsVerticalScrollIndicator={false}
              onScroll={handleListScroll}
              scrollEventThrottle={16}
              onViewableItemsChanged={onViewableItemsChanged.current}
              viewabilityConfig={viewabilityConfig.current}
              ListFooterComponent={
                isLoadingChunk ? (
                  <Text style={[styles.loadingFooter, { color: palette.textSecondary }]}>
                    Loading...
                  </Text>
                ) : null
              }
            />
          </Pressable>
        </GestureDetector>

        {/* ── Brightness dim overlay (non-interactive) ───────────────── */}
        {settings.brightness < 1 && (
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: '#000', opacity: (1 - settings.brightness) * 0.85 },
            ]}
          />
        )}

        {/* ── Header overlay ─────────────────────────────────────────── */}
        <Animated.View
          style={[
            styles.headerOverlay,
            headerAnim,
            {
              paddingTop: insets.top + SPACING.xs,
              backgroundColor: palette.surfaceGlass,
            },
          ]}
        >
          <Pressable
            onPress={() => {
              persistPosition();
              navigation.goBack();
            }}
          >
            <Text style={[styles.overlayButton, { color: palette.text }]}>← Back</Text>
          </Pressable>
          <Text style={[styles.headerTitle, { color: palette.text }]} numberOfLines={1}>
            {chapter.title}
          </Text>
          <Pressable onPress={() => setShowDrawer(true)}>
            <Text style={[styles.overlayButton, { color: palette.text }]}>☰</Text>
          </Pressable>
        </Animated.View>

        {/* ── Footer overlay ─────────────────────────────────────────── */}
        <Animated.View
          style={[
            styles.footerOverlay,
            footerAnim,
            {
              paddingBottom: insets.bottom + SPACING.xs,
              backgroundColor: palette.surfaceGlass,
            },
          ]}
        >
          {/* Progress bar */}
          <View style={[styles.progressTrack, { backgroundColor: palette.border }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${progressPct}%`, backgroundColor: palette.accent },
              ]}
            />
          </View>

          <View style={styles.footerRow}>
            <Pressable onPress={handleBookmark}>
              <Text style={[styles.overlayButton, { color: palette.accent }]}>🔖</Text>
            </Pressable>

            {/* TTS toggle */}
            <Pressable onPress={toggleTts}>
              <Text
                style={[
                  styles.overlayButton,
                  { color: isSpeaking ? palette.accent : palette.textSecondary },
                ]}
              >
                {isSpeaking ? '⏸' : isPaused ? '▶' : '🔊'}
              </Text>
            </Pressable>

            {/* Auto-scroll toggle */}
            <Pressable onPress={() => setAutoScroll((v) => !v)}>
              <Text
                style={[
                  styles.overlayButton,
                  { color: autoScroll ? palette.accent : palette.textSecondary },
                ]}
              >
                {autoScroll ? '⏬' : '↧'}
              </Text>
            </Pressable>

            <Text style={[styles.footerInfo, { color: palette.textSecondary }]}>
              {visibleParagraphIndex + 1}/{paragraphs.length} · {progressPct.toFixed(0)}%
            </Text>
            <Pressable onPress={() => setShowSettings(!showSettings)}>
              <Text style={[styles.overlayButton, { color: palette.accent }]}>Aa</Text>
            </Pressable>
          </View>

          {/* ── Settings panel ────────────────────────────────────────── */}
          {showSettings && (
            <Animated.View
              entering={FadeIn.duration(150)}
              exiting={FadeOut.duration(150)}
              style={[styles.settingsPanel, { backgroundColor: palette.surface }]}
            >
              {/* Font size */}
              <View style={styles.settingRow}>
                <Text style={[styles.settingLabel, { color: palette.textSecondary }]}>
                  Font Size
                </Text>
                <View style={styles.settingControls}>
                  <Pressable onPress={() => adjustFontSize(-1)} style={styles.stepper}>
                    <Text style={{ color: palette.text, fontSize: 18 }}>−</Text>
                  </Pressable>
                  <Text style={[styles.settingValue, { color: palette.text }]}>
                    {settings.fontSize}
                  </Text>
                  <Pressable onPress={() => adjustFontSize(1)} style={styles.stepper}>
                    <Text style={{ color: palette.text, fontSize: 18 }}>+</Text>
                  </Pressable>
                </View>
              </View>

              {/* Line height */}
              <View style={styles.settingRow}>
                <Text style={[styles.settingLabel, { color: palette.textSecondary }]}>
                  Line Height
                </Text>
                <View style={styles.settingControls}>
                  <Pressable onPress={() => adjustLineHeight(-0.1)} style={styles.stepper}>
                    <Text style={{ color: palette.text, fontSize: 18 }}>−</Text>
                  </Pressable>
                  <Text style={[styles.settingValue, { color: palette.text }]}>
                    {settings.lineHeight.toFixed(1)}
                  </Text>
                  <Pressable onPress={() => adjustLineHeight(0.1)} style={styles.stepper}>
                    <Text style={{ color: palette.text, fontSize: 18 }}>+</Text>
                  </Pressable>
                </View>
              </View>

              {/* Font family */}
              <View style={styles.settingRow}>
                <Text style={[styles.settingLabel, { color: palette.textSecondary }]}>
                  Typeface
                </Text>
                <View style={styles.themeChips}>
                  {FONT_OPTIONS.map((key) => {
                    const active = settings.fontFamily === key;
                    return (
                      <Pressable
                        key={key}
                        onPress={() => updateSettings({ fontFamily: key })}
                        style={[
                          styles.themeChip,
                          {
                            backgroundColor: active ? palette.accent : palette.surface,
                            borderColor: active ? palette.accent : palette.border,
                            borderWidth: 1,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: active ? palette.onAccent : palette.textSecondary,
                            fontSize: 10,
                            fontWeight: '600',
                            fontFamily: FONT_FAMILY_MAP[key],
                          }}
                        >
                          {FONT_FAMILY_LABELS[key]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Brightness */}
              <View style={styles.settingRow}>
                <Text style={[styles.settingLabel, { color: palette.textSecondary }]}>
                  Brightness
                </Text>
                <View style={styles.settingControls}>
                  <Pressable onPress={() => adjustBrightness(-0.1)} style={styles.stepper}>
                    <Text style={{ color: palette.text, fontSize: 18 }}>−</Text>
                  </Pressable>
                  <Text style={[styles.settingValue, { color: palette.text }]}>
                    {Math.round(settings.brightness * 100)}%
                  </Text>
                  <Pressable onPress={() => adjustBrightness(0.1)} style={styles.stepper}>
                    <Text style={{ color: palette.text, fontSize: 18 }}>+</Text>
                  </Pressable>
                </View>
              </View>

              {/* Auto-scroll speed */}
              <View style={styles.settingRow}>
                <Text style={[styles.settingLabel, { color: palette.textSecondary }]}>
                  Auto-Scroll
                </Text>
                <View style={styles.settingControls}>
                  <Pressable onPress={() => adjustAutoScrollSpeed(-10)} style={styles.stepper}>
                    <Text style={{ color: palette.text, fontSize: 18 }}>−</Text>
                  </Pressable>
                  <Text style={[styles.settingValue, { color: palette.text }]}>
                    {settings.autoScrollSpeed}
                  </Text>
                  <Pressable onPress={() => adjustAutoScrollSpeed(10)} style={styles.stepper}>
                    <Text style={{ color: palette.text, fontSize: 18 }}>+</Text>
                  </Pressable>
                </View>
              </View>

              {/* Theme chips */}
              <View style={styles.settingRow}>
                <Text style={[styles.settingLabel, { color: palette.textSecondary }]}>Theme</Text>
                <View style={styles.themeChips}>
                  {THEME_OPTIONS.map((opt) => {
                    const p = getPalette(opt.key);
                    const active = settings.theme === opt.key;
                    return (
                      <Pressable
                        key={opt.key}
                        onPress={() => updateSettings({ theme: opt.key })}
                        style={[
                          styles.themeChip,
                          {
                            backgroundColor: p.readerBg,
                            borderColor: active ? palette.accent : palette.border,
                            borderWidth: active ? 2 : 1,
                          },
                        ]}
                      >
                        <Text style={{ color: p.readerText, fontSize: 10, fontWeight: '600' }}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* TTS Speed */}
              <View style={styles.settingRow}>
                <Text style={[styles.settingLabel, { color: palette.textSecondary }]}>
                  TTS Speed
                </Text>
                <View style={styles.settingControls}>
                  <Pressable
                    onPress={() => {
                      const next = Math.max(0.5, +(settings.ttsSpeed - 0.25).toFixed(2));
                      updateSettings({ ttsSpeed: next });
                    }}
                    style={styles.stepper}
                  >
                    <Text style={{ color: palette.text, fontSize: 18 }}>−</Text>
                  </Pressable>
                  <Text style={[styles.settingValue, { color: palette.text }]}>
                    {settings.ttsSpeed.toFixed(2)}×
                  </Text>
                  <Pressable
                    onPress={() => {
                      const next = Math.min(3.0, +(settings.ttsSpeed + 0.25).toFixed(2));
                      updateSettings({ ttsSpeed: next });
                    }}
                    style={styles.stepper}
                  >
                    <Text style={{ color: palette.text, fontSize: 18 }}>+</Text>
                  </Pressable>
                </View>
              </View>

              {/* TTS Stop button (only visible when TTS is active) */}
              {(isSpeaking || isPaused) && (
                <Pressable
                  onPress={stopTts}
                  style={[styles.ttsStopBtn, { backgroundColor: palette.accent + '22' }]}
                >
                  <Text style={{ color: palette.accent, fontSize: 13, fontWeight: '600' }}>
                    Stop TTS
                  </Text>
                </Pressable>
              )}
            </Animated.View>
          )}
        </Animated.View>

        {/* ── Side drawer (chapters + bookmarks) ─────────────────────── */}
        {showDrawer && (
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(200)}
            style={[styles.drawer, { backgroundColor: palette.surface }]}
          >
            <View style={[styles.drawerHeader, { paddingTop: insets.top + SPACING.sm }]}>
              <Text style={[styles.drawerTitle, { color: palette.text }]}>Chapters</Text>
              <Pressable onPress={() => setShowDrawer(false)}>
                <Text style={{ color: palette.textSecondary, fontSize: 18 }}>✕</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={openBookmarks}
              style={[styles.drawerBookmarks, { borderBottomColor: palette.border }]}
            >
              <Text style={{ color: palette.accent, fontSize: 14, fontWeight: '600' }}>
                🔖 View bookmarks
              </Text>
            </Pressable>

            <FlashList
              data={chapters as Chapter[]}
              renderItem={({ item }) => {
                const isActive = item.id === chapter.id;
                return (
                  <Pressable
                    onPress={() => handleDrawerChapter(item)}
                    style={[
                      styles.drawerItem,
                      {
                        backgroundColor: isActive ? palette.accent + '18' : 'transparent',
                        borderBottomColor: palette.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.drawerItemText,
                        {
                          color: isActive ? palette.accent : palette.text,
                          fontWeight: isActive ? '700' : '400',
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                  </Pressable>
                );
              }}
              keyExtractor={(item) => item.id}
              estimatedItemSize={48}
            />
          </Animated.View>
        )}
      </View>
    </GestureHandlerRootView>
  );
};

export { ReaderScreen };

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  readArea: {
    flex: 1,
  },
  paragraph: {
    fontFamily: undefined, // uses system default for readability
    textAlign: 'justify',
  },
  loadingFooter: {
    textAlign: 'center',
    paddingVertical: SPACING.lg,
    fontSize: 13,
  },

  // Overlays
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    marginHorizontal: SPACING.sm,
  },
  footerOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xs,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.xs,
  },
  footerInfo: {
    fontSize: 12,
  },
  overlayButton: {
    fontSize: 16,
    fontWeight: '600',
    paddingHorizontal: SPACING.xs,
    paddingVertical: SPACING.xs,
  },

  // Progress bar
  progressTrack: {
    height: 3,
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 1.5,
  },

  // Settings panel
  settingsPanel: {
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  settingLabel: {
    fontSize: 13,
    fontWeight: '500',
    width: 90,
  },
  settingControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  settingValue: {
    fontSize: 14,
    fontWeight: '600',
    minWidth: 32,
    textAlign: 'center',
  },
  stepper: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  themeChips: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  themeChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
  },

  // Drawer
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 280,
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  drawerItem: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  drawerBookmarks: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  drawerItemText: {
    fontSize: 13,
  },

  // TTS
  ttsStopBtn: {
    alignSelf: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    marginTop: SPACING.xs,
  },
});
