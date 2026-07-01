/**
 * NovelDetailScreen — Synopsis & Chapter Index.
 *
 * Features:
 *   - Parallax hero with blurred cover gradient overlay
 *   - Description from description.txt
 *   - "Continue Reading" / "Start from Beginning" CTAs
 *   - Virtualized chapter list (FlashList) with read/bookmarked state
 */

import React, { useCallback, useMemo } from 'react';
import { View, Text, Image, StyleSheet, Pressable, StatusBar } from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLibraryStore } from '../store/libraryStore';
import { useReadingStore } from '../store/readingStore';
import { useTheme } from '../hooks/useTheme';

import type { Novel, Chapter, NovelId } from '../types/library.types';
import type { SafUri } from '../types/saf.types';
import type { ScreenProps } from '../navigation/types';
import { SPACING, RADIUS } from '../theme/colors';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HERO_HEIGHT = 320;
const PARALLAX_FACTOR = 0.4;

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

const NovelDetailScreen: React.FC<ScreenProps<'NovelDetail'>> = ({ route, navigation }) => {
  const palette = useTheme();
  const insets = useSafeAreaInsets();
  const { novelId } = route.params;

  const novel = useLibraryStore((s) => s.library?.novels[novelId as NovelId]) as Novel | undefined;

  const progress = useReadingStore((s) => s.progressMap[novelId as NovelId]);
  const completedUris = useMemo(
    () => new Set<SafUri>(progress?.completedChapterUris ?? []),
    [progress],
  );
  const bookmarkedChapterUris = useMemo(() => {
    const set = new Set<SafUri>();
    progress?.bookmarks.forEach((b) => set.add(b.chapterUri));
    return set;
  }, [progress]);

  // ── Parallax scroll ──────────────────────────────────────────────────────
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const heroAnimStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [-HERO_HEIGHT, 0, HERO_HEIGHT],
          [HERO_HEIGHT * PARALLAX_FACTOR, 0, -HERO_HEIGHT * PARALLAX_FACTOR],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  // ── Navigation handlers ──────────────────────────────────────────────────
  const handleContinue = useCallback(() => {
    if (!novel || novel.chapters.length === 0) return;

    // Find the last read chapter, or fall back to chapter 1
    let chapter = novel.chapters[0]!;
    if (progress) {
      const found = novel.chapters.find((c) => c.fileName === progress.lastReadChapterFileName);
      if (found) chapter = found;
    }

    navigation.navigate('Reader', { novelId: novel.id, chapter });
  }, [novel, progress, navigation]);

  const handleStart = useCallback(() => {
    if (!novel || novel.chapters.length === 0) return;
    navigation.navigate('Reader', {
      novelId: novel.id,
      chapter: novel.chapters[0]!,
    });
  }, [novel, navigation]);

  const handleChapterPress = useCallback(
    (chapter: Chapter) => {
      if (!novel) return;
      navigation.navigate('Reader', { novelId: novel.id, chapter });
    },
    [novel, navigation],
  );

  // ── Render guards ────────────────────────────────────────────────────────
  if (!novel) {
    return (
      <View style={[styles.root, { backgroundColor: palette.background }]}>
        <Text style={{ color: palette.textSecondary, textAlign: 'center', marginTop: 100 }}>
          Novel not found.
        </Text>
      </View>
    );
  }

  // ── Chapter row renderer ────────────────────────────────────────────────
  const renderChapter = ({ item }: { item: Chapter }) => {
    const isRead = completedUris.has(item.uri);
    const isBookmarked = bookmarkedChapterUris.has(item.uri);
    return (
      <Pressable
        onPress={() => handleChapterPress(item)}
        style={[styles.chapterRow, { borderBottomColor: palette.border }]}
      >
        <View style={styles.chapterInfo}>
          <Text
            style={[styles.chapterTitle, { color: isRead ? palette.textSecondary : palette.text }]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text style={[styles.chapterMeta, { color: palette.textSecondary }]}>
            {(item.sizeBytes / 1024).toFixed(0)} KB
          </Text>
        </View>
        {isBookmarked && <Text style={styles.bookmarkIcon}>🔖</Text>}
      </Pressable>
    );
  };

  // ── Header above chapter list (hero + description + CTAs) ───────────────
  const listHeaderElement = (
    <View>
      {/* Hero */}
      <View style={styles.heroWrapper}>
        <Animated.View style={[styles.heroImage, heroAnimStyle]}>
          {novel.coverUri ? (
            <Image
              source={{ uri: novel.coverUri as string }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              blurRadius={8}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.accent + '33' }]} />
          )}
          {/* Gradient overlay */}
          <View style={[styles.heroGradient, { backgroundColor: palette.background }]} />
        </Animated.View>

        {/* Cover thumbnail + title */}
        <View style={[styles.heroContent, { paddingTop: insets.top + SPACING.lg }]}>
          <View style={[styles.coverThumb, { borderColor: palette.border }]}>
            {novel.coverUri ? (
              <Image
                source={{ uri: novel.coverUri as string }}
                style={styles.coverThumbImage}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.coverThumbPlaceholder, { backgroundColor: palette.surface }]}>
                <Text style={{ color: palette.accent, fontSize: 32, fontWeight: '700' }}>
                  {novel.title[0]?.toUpperCase()}
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.novelTitle, { color: palette.text }]} numberOfLines={3}>
            {novel.title}
          </Text>
          <Text style={[styles.novelMeta, { color: palette.textSecondary }]}>
            {novel.totalChapters} Chapters
          </Text>
        </View>
      </View>

      {/* CTAs */}
      <View style={styles.ctaRow}>
        <Pressable
          onPress={handleContinue}
          style={[styles.ctaPrimary, { backgroundColor: palette.accent }]}
        >
          <Text style={[styles.ctaText, { color: palette.onAccent }]}>▶ Continue Reading</Text>
        </Pressable>
        <Pressable
          onPress={handleStart}
          style={[styles.ctaSecondary, { borderColor: palette.accent }]}
        >
          <Text style={[styles.ctaText, { color: palette.accent }]}>⏩ Start from Ch.1</Text>
        </Pressable>
      </View>

      {/* Description */}
      {novel.description ? (
        <View style={styles.descriptionBox}>
          <Text style={[styles.sectionLabel, { color: palette.textSecondary }]}>Synopsis</Text>
          <Text style={[styles.descriptionText, { color: palette.text }]}>{novel.description}</Text>
        </View>
      ) : null}

      {/* Chapter list header */}
      <View style={styles.chapterListHeader}>
        <Text style={[styles.sectionLabel, { color: palette.textSecondary }]}>Chapters</Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <StatusBar barStyle={palette.statusBar} translucent backgroundColor="transparent" />
      <FlashList
        data={novel.chapters as Chapter[]}
        renderItem={renderChapter}
        keyExtractor={(item) => item.id}
        estimatedItemSize={56}
        ListHeaderComponent={listHeaderElement}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        onScroll={scrollHandler as any}
      />

      {/* Back button */}
      <Pressable
        onPress={() => navigation.goBack()}
        style={[styles.backButton, { top: insets.top + SPACING.xs }]}
      >
        <View style={[styles.backButtonBg, { backgroundColor: palette.surfaceGlass }]}>
          <Text style={{ color: palette.text, fontSize: 18 }}>←</Text>
        </View>
      </Pressable>

      {/* Bookmarks button */}
      <Pressable
        onPress={() => navigation.navigate('Bookmarks', { novelId: novel.id })}
        style={[styles.bookmarksButton, { top: insets.top + SPACING.xs }]}
      >
        <View style={[styles.backButtonBg, { backgroundColor: palette.surfaceGlass }]}>
          <Text style={{ fontSize: 16 }}>🔖</Text>
        </View>
      </Pressable>
    </View>
  );
};

export { NovelDetailScreen };

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 80,
  },

  // Hero
  heroWrapper: {
    height: HERO_HEIGHT,
    overflow: 'hidden',
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    height: HERO_HEIGHT + 60,
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.65,
  },
  heroContent: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  coverThumb: {
    width: 100,
    height: 150,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    borderWidth: 2,
    marginBottom: SPACING.md,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  coverThumbImage: {
    width: '100%',
    height: '100%',
  },
  coverThumbPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  novelTitle: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  novelMeta: {
    fontSize: 13,
    marginTop: SPACING.xs,
  },

  // CTAs
  ctaRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  ctaPrimary: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
  },
  ctaSecondary: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
  },
  ctaText: {
    fontSize: 14,
    fontWeight: '700',
  },

  // Description
  descriptionBox: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 22,
  },

  // Chapter list
  chapterListHeader: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  chapterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  chapterInfo: {
    flex: 1,
  },
  chapterTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  chapterMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  bookmarkIcon: {
    fontSize: 16,
    marginLeft: SPACING.sm,
  },

  // Back button
  backButton: {
    position: 'absolute',
    left: SPACING.md,
    zIndex: 10,
  },
  bookmarksButton: {
    position: 'absolute',
    right: SPACING.md,
    zIndex: 10,
  },
  backButtonBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
