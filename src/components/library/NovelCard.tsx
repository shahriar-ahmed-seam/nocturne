/**
 * NovelCard — a single novel cover tile for the Library grid.
 *
 * Features:
 *   - SAF cover.jpg via content:// URI
 *   - Fallback gradient placeholder with initials
 *   - Press scaling animation (Reanimated)
 *   - Glassmorphism title overlay
 *   - Chapter count badge
 */

import React, { useCallback, useMemo } from 'react';
import { View, Text, Image, StyleSheet, Pressable, Dimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import type { Novel } from '../../types/library.types';
import { useTheme } from '../../hooks/useTheme';
import { SPACING, RADIUS, GRID_COLUMNS, GRID_GAP, COVER_ASPECT_RATIO } from '../../theme/colors';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface NovelCardProps {
  novel: Novel;
  onPress: (novel: Novel) => void;
}

// ---------------------------------------------------------------------------
// Calculate card dimensions
// ---------------------------------------------------------------------------

const screenWidth = Dimensions.get('window').width;
const cardWidth = (screenWidth - SPACING.md * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
const cardHeight = cardWidth / COVER_ASPECT_RATIO;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const NovelCard: React.FC<NovelCardProps> = React.memo(({ novel, onPress }) => {
  const palette = useTheme();
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.95, { damping: 15, stiffness: 200 });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 15, stiffness: 200 });
  }, [scale]);

  const handlePress = useCallback(() => {
    onPress(novel);
  }, [novel, onPress]);

  const initials = useMemo(
    () =>
      novel.title
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? '')
        .join(''),
    [novel.title],
  );

  return (
    <Animated.View style={[styles.wrapper, animStyle]}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.pressable}
      >
        {/* Cover image or placeholder */}
        <View
          style={[
            styles.coverContainer,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          {novel.coverUri ? (
            <Image
              source={{ uri: novel.coverUri as string }}
              style={styles.coverImage}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.placeholder, { backgroundColor: palette.accent + '22' }]}>
              <Text style={[styles.placeholderText, { color: palette.accent }]}>{initials}</Text>
            </View>
          )}

          {/* Glassmorphism title overlay */}
          <View style={[styles.titleOverlay, { backgroundColor: palette.surfaceGlass }]}>
            <Text style={[styles.titleText, { color: palette.text }]} numberOfLines={2}>
              {novel.title}
            </Text>
            <Text style={[styles.chapterCount, { color: palette.textSecondary }]}>
              {novel.totalChapters} ch.
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
});

NovelCard.displayName = 'NovelCard';

export { NovelCard, cardWidth, cardHeight };

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  wrapper: {
    width: cardWidth,
    marginBottom: GRID_GAP,
  },
  pressable: {
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  coverContainer: {
    width: cardWidth,
    height: cardHeight,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 2,
  },
  titleOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: SPACING.xs,
  },
  titleText: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
  },
  chapterCount: {
    fontSize: 9,
    marginTop: 1,
  },
});
