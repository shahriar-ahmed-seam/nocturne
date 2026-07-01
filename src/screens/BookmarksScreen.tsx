/**
 * BookmarksScreen — browse and manage every bookmark saved for a novel.
 *
 * Bookmarks are stored per-novel inside `reading_backup.json`. This screen
 * lets the reader review their snippets, jump back into the relevant chapter,
 * or remove a bookmark. Grouped implicitly by chapter via the row subtitle.
 */

import React, { useCallback, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, StatusBar } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLibraryStore } from '../store/libraryStore';
import { useReadingStore } from '../store/readingStore';
import { useTheme } from '../hooks/useTheme';

import type { NovelId, Chapter } from '../types/library.types';
import type { Bookmark } from '../types/state.types';
import type { ScreenProps } from '../navigation/types';
import { SPACING, RADIUS } from '../theme/colors';

const BookmarksScreen: React.FC<ScreenProps<'Bookmarks'>> = ({ route, navigation }) => {
  const palette = useTheme();
  const insets = useSafeAreaInsets();
  const { novelId } = route.params;

  const novel = useLibraryStore((s) => s.library?.novels[novelId as NovelId]);
  const progress = useReadingStore((s) => s.progressMap[novelId as NovelId]);
  const removeBookmark = useReadingStore((s) => s.removeBookmark);
  const persistProgress = useReadingStore((s) => s.persistProgress);

  const bookmarks = useMemo<Bookmark[]>(
    () => [...(progress?.bookmarks ?? [])].sort((a, b) => b.createdAt - a.createdAt),
    [progress],
  );

  const openBookmark = useCallback(
    (bookmark: Bookmark) => {
      if (!novel) return;
      const chapter: Chapter | undefined = novel.chapters.find(
        (c) => c.uri === bookmark.chapterUri,
      );
      if (!chapter) return;
      navigation.navigate('Reader', { novelId: novel.id, chapter });
    },
    [novel, navigation],
  );

  const handleRemove = useCallback(
    (id: string) => {
      removeBookmark(id);
      void persistProgress();
    },
    [removeBookmark, persistProgress],
  );

  const renderItem = useCallback(
    ({ item }: { item: Bookmark }) => (
      <Pressable
        onPress={() => openBookmark(item)}
        style={[styles.row, { backgroundColor: palette.surface, borderColor: palette.border }]}
      >
        <View style={styles.rowMain}>
          <Text style={[styles.chapter, { color: palette.accent }]} numberOfLines={1}>
            {item.chapterFileName.replace(/\.txt$/i, '')}
          </Text>
          <Text style={[styles.snippet, { color: palette.text }]} numberOfLines={3}>
            “{item.snippet}…”
          </Text>
          <Text style={[styles.meta, { color: palette.textSecondary }]}>
            ¶ {item.paragraphIndex + 1} · {new Date(item.createdAt).toLocaleDateString()}
          </Text>
        </View>
        <Pressable hitSlop={10} onPress={() => handleRemove(item.id)} style={styles.remove}>
          <Text style={{ color: palette.textSecondary, fontSize: 18 }}>✕</Text>
        </Pressable>
      </Pressable>
    ),
    [palette, openBookmark, handleRemove],
  );

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <StatusBar barStyle={palette.statusBar} backgroundColor={palette.background} />
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Text style={[styles.back, { color: palette.text }]}>←</Text>
        </Pressable>
        <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
          Bookmarks
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {bookmarks.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🔖</Text>
          <Text style={[styles.emptyText, { color: palette.textSecondary }]}>
            No bookmarks yet.{'\n'}Tap the bookmark button while reading to save a spot.
          </Text>
        </View>
      ) : (
        <FlashList
          data={bookmarks}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          estimatedItemSize={110}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

export { BookmarksScreen };

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  back: { fontSize: 22, fontWeight: '700', width: 24 },
  title: { fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' },
  listContent: { padding: SPACING.md },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  rowMain: { flex: 1 },
  chapter: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
  snippet: { fontSize: 14, lineHeight: 20, fontStyle: 'italic' },
  meta: { fontSize: 11, marginTop: SPACING.xs },
  remove: { paddingLeft: SPACING.sm, paddingTop: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  emptyIcon: { fontSize: 48, marginBottom: SPACING.md },
  emptyText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
