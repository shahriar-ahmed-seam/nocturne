/**
 * SortFilterBar — horizontal bar with sort toggle chips and a search input.
 * Debounces search at 300 ms before writing to the Zustand store.
 */

import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { useDebounce } from '../../hooks/useDebounce';
import { useLibraryStore } from '../../store/libraryStore';
import { useTheme } from '../../hooks/useTheme';
import { SPACING, RADIUS } from '../../theme/colors';
import type { LibrarySortKey } from '../../types/library.types';
import { useEffect } from 'react';

const SORT_OPTIONS: { key: LibrarySortKey; label: string }[] = [
  { key: 'recentlyRead', label: 'Recent' },
  { key: 'alphabetical', label: 'A-Z' },
  { key: 'chapterCount', label: 'Chapters' },
];

const SortFilterBar: React.FC = () => {
  const palette = useTheme();
  const sortBy = useLibraryStore((s) => s.filter.sortBy);
  const setSortBy = useLibraryStore((s) => s.setSortBy);
  const setSearchQuery = useLibraryStore((s) => s.setSearchQuery);

  const [localQuery, setLocalQuery] = useState('');
  const debouncedQuery = useDebounce(localQuery, 300);

  useEffect(() => {
    setSearchQuery(debouncedQuery);
  }, [debouncedQuery, setSearchQuery]);

  const handleSort = useCallback(
    (key: LibrarySortKey) => {
      setSortBy(key);
    },
    [setSortBy],
  );

  return (
    <View style={styles.container}>
      {/* Search */}
      <View
        style={[
          styles.searchBox,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
      >
        <Text style={{ color: palette.textSecondary, marginRight: SPACING.xs }}>🔍</Text>
        <TextInput
          value={localQuery}
          onChangeText={setLocalQuery}
          placeholder="Search novels..."
          placeholderTextColor={palette.textSecondary}
          style={[styles.searchInput, { color: palette.text }]}
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      {/* Sort chips */}
      <View style={styles.chips}>
        {SORT_OPTIONS.map((opt) => {
          const active = sortBy === opt.key;
          return (
            <Pressable
              key={opt.key}
              onPress={() => handleSort(opt.key)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? palette.accent : palette.surface,
                  borderColor: active ? palette.accent : palette.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: active ? palette.onAccent : palette.textSecondary },
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

export { SortFilterBar };

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACING.sm,
    height: 40,
    marginBottom: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  chips: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
