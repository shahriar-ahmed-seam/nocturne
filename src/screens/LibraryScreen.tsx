/**
 * LibraryScreen — the Home view.
 *
 * - Immersive grid of novel covers via FlashList
 * - Fuzzy search (debounced 300 ms)
 * - Sort by Recent / A-Z / Chapter count
 * - Pull-to-refresh triggers background SAF rescan
 * - Empty state with SAF folder picker CTA
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import { View, Text, StatusBar, StyleSheet, RefreshControl, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLibraryStore } from '../store/libraryStore';
import { useReadingStore } from '../store/readingStore';
import { useTheme } from '../hooks/useTheme';
import { useLibraryScanner } from '../hooks/useLibraryScanner';
import { SafStorageService } from '../storage/SafStorageService';

import { NovelCard, cardHeight } from '../components/library/NovelCard';
import { SortFilterBar } from '../components/library/SortFilterBar';
import { EmptyLibrary } from '../components/library/EmptyLibrary';

import type { Novel, NovelId } from '../types/library.types';
import type { ScreenProps } from '../navigation/types';
import { SPACING, GRID_COLUMNS, GRID_GAP } from '../theme/colors';

// ---------------------------------------------------------------------------
// Simple fuzzy match (case-insensitive substring search on title + description)
// ---------------------------------------------------------------------------

function fuzzyMatch(novel: Novel, query: string): boolean {
  const q = query.toLowerCase();
  if (novel.title.toLowerCase().includes(q)) return true;
  if (novel.description?.toLowerCase().includes(q)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

const LibraryScreen: React.FC<ScreenProps<'Library'>> = ({ navigation }) => {
  const palette = useTheme();
  const insets = useSafeAreaInsets();
  const { scan, isScanning } = useLibraryScanner();

  const treeUri = useLibraryStore((s) => s.treeUri);
  const library = useLibraryStore((s) => s.library);
  const filter = useLibraryStore((s) => s.filter);
  const setTreeUri = useLibraryStore((s) => s.setTreeUri);
  const progressMap = useReadingStore((s) => s.progressMap);

  // ── Auto-scan on first mount when we have a tree URI ────────────────────
  useEffect(() => {
    // Scan if: we have a treeUri AND (no library yet OR never scanned before)
    if (treeUri && (!library || library.lastScannedAt === null)) {
      void scan();
    }
  }, [treeUri, library, scan]);

  // ── Derive sorted + filtered novel list ─────────────────────────────────
  const novels = useMemo(() => {
    if (!library) return [];

    let list = library.novelOrder
      .map((id) => library.novels[id])
      .filter((n): n is Novel => n !== undefined);

    // Search filter
    if (filter.searchQuery.length > 0) {
      list = list.filter((n) => fuzzyMatch(n, filter.searchQuery));
    }

    // Sort
    switch (filter.sortBy) {
      case 'alphabetical':
        list = [...list].sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'chapterCount':
        list = [...list].sort((a, b) => b.totalChapters - a.totalChapters);
        break;
      case 'recentlyRead':
      default: {
        list = [...list].sort((a, b) => {
          const aTime = progressMap[a.id as NovelId]?.lastAccessedAt ?? 0;
          const bTime = progressMap[b.id as NovelId]?.lastAccessedAt ?? 0;
          return bTime - aTime;
        });
        break;
      }
    }

    return list;
  }, [library, filter, progressMap]);

  // ── SAF folder picker ──────────────────────────────────────────────────
  const handleSelectFolder = useCallback(async () => {
    const saf = SafStorageService.getInstance();
    const result = await saf.requestLibraryPermission();
    if (result.ok) {
      setTreeUri(result.value.treeUri);
      // Initialise the library object so the scanner has a place to write
      useLibraryStore.setState({
        library: {
          treeUri: result.value.treeUri,
          novels: {},
          novelOrder: [],
          lastScannedAt: null,
          isScanning: false,
        },
      });
      void scan();
    }
  }, [setTreeUri, scan]);

  // ── Navigate to novel detail ────────────────────────────────────────────
  const handleNovelPress = useCallback(
    (novel: Novel) => {
      navigation.navigate('NovelDetail', { novelId: novel.id });
    },
    [navigation],
  );

  // ── Render item ─────────────────────────────────────────────────────────
  const renderItem = useCallback(
    ({ item }: { item: Novel }) => <NovelCard novel={item} onPress={handleNovelPress} />,
    [handleNovelPress],
  );

  // ── Empty / No permission ───────────────────────────────────────────────
  if (!treeUri || (library && novels.length === 0 && filter.searchQuery.length === 0)) {
    return (
      <View style={[styles.root, { backgroundColor: palette.background }]}>
        <StatusBar barStyle={palette.statusBar} backgroundColor={palette.background} />
        <EmptyLibrary hasPermission={!!treeUri} onSelectFolder={handleSelectFolder} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <StatusBar barStyle={palette.statusBar} backgroundColor={palette.background} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
        <Text style={[styles.headerTitle, { color: palette.text }]}>Library</Text>
        <Pressable
          onPress={() => navigation.navigate('Download')}
          style={[styles.downloadBtn, { backgroundColor: palette.accent }]}
        >
          <Text style={{ color: palette.onAccent, fontSize: 13, fontWeight: '700' }}>+ Import</Text>
        </Pressable>
      </View>

      {/* Search + Sort */}
      <SortFilterBar />

      {/* Novel grid */}
      <FlashList
        data={novels}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        numColumns={GRID_COLUMNS}
        estimatedItemSize={cardHeight + GRID_GAP}
        contentContainerStyle={styles.gridContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isScanning}
            onRefresh={scan}
            tintColor={palette.accent}
            colors={[palette.accent]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptySearch}>
            <Text style={[styles.emptySearchText, { color: palette.textSecondary }]}>
              No novels match "{filter.searchQuery}"
            </Text>
          </View>
        }
      />
    </View>
  );
};

export { LibraryScreen };

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  downloadBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: 16,
  },
  gridContent: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  emptySearch: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptySearchText: {
    fontSize: 14,
  },
});
