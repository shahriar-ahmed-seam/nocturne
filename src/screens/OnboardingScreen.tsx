/**
 * OnboardingScreen — cinematic first-run experience.
 *
 * A full-screen, swipeable hero carousel (Unsplash photography) that
 * introduces Nocturne's pillars, then hands off to the SAF folder picker.
 * Shown once; a MMKV flag (`hasSeenOnboarding`) suppresses it thereafter.
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  ImageBackground,
  StyleSheet,
  Pressable,
  StatusBar,
  Dimensions,
  ScrollView,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ONBOARDING_IMAGES } from '../assets';
import { markOnboardingSeen } from '../services/SettingsService';
import { useLibraryStore } from '../store/libraryStore';
import { SPACING, RADIUS } from '../theme/colors';
import type { ScreenProps } from '../navigation/types';

const { width, height } = Dimensions.get('window');

interface Slide {
  image: number;
  eyebrow: string;
  title: string;
  body: string;
}

const SLIDES: readonly Slide[] = [
  {
    image: ONBOARDING_IMAGES.lights,
    eyebrow: 'WELCOME TO NOCTURNE',
    title: 'Your library,\nafter dark.',
    body: 'A distraction-free reader built for the long nights and longer sagas. No account. No cloud lock-in.',
  },
  {
    image: ONBOARDING_IMAGES.stars,
    eyebrow: 'BUILT FOR BIG BOOKS',
    title: 'Chapters that\nnever choke.',
    body: 'A native streaming engine reads 50 MB+ chapter files in 64 KB slices — buttery scrolling, zero out-of-memory crashes.',
  },
  {
    image: ONBOARDING_IMAGES.library,
    eyebrow: 'YOURS TO KEEP',
    title: 'Progress that\ntravels with you.',
    body: 'Reading position, bookmarks and settings live in your own folder. Copy it anywhere and pick up exactly where you left off.',
  },
];

const OnboardingScreen: React.FC<ScreenProps<'Onboarding'>> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const requestLibraryAccess = useLibraryStore((s) => s.requestLibraryAccess);
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const isLast = index === SLIDES.length - 1;

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    setIndex(next);
  }, []);

  const goNext = useCallback(() => {
    if (isLast) return;
    scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
  }, [index, isLast]);

  const finish = useCallback(
    async (pickFolder: boolean) => {
      markOnboardingSeen();
      if (pickFolder) {
        await requestLibraryAccess();
      }
      navigation.replace('Library');
    },
    [navigation, requestLibraryAccess],
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {SLIDES.map((slide, i) => (
          <ImageBackground key={i} source={slide.image} style={styles.slide} resizeMode="cover">
            {/* Cinematic dark scrim for legibility */}
            <View style={styles.scrim} />
            <View style={[styles.slideContent, { paddingBottom: insets.bottom + 180 }]}>
              <Text style={styles.eyebrow}>{slide.eyebrow}</Text>
              <Text style={styles.title}>{slide.title}</Text>
              <Text style={styles.body}>{slide.body}</Text>
            </View>
          </ImageBackground>
        ))}
      </ScrollView>

      {/* Pagination dots */}
      <View style={[styles.dots, { bottom: insets.bottom + 140 }]}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, { opacity: i === index ? 1 : 0.35, width: i === index ? 22 : 7 }]}
          />
        ))}
      </View>

      {/* Actions */}
      <View style={[styles.actions, { paddingBottom: insets.bottom + SPACING.lg }]}>
        {isLast ? (
          <Pressable style={styles.primaryBtn} onPress={() => void finish(true)}>
            <Text style={styles.primaryText}>Choose your library folder</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.primaryBtn} onPress={goNext}>
            <Text style={styles.primaryText}>Next</Text>
          </Pressable>
        )}
        <Pressable style={styles.skipBtn} onPress={() => void finish(false)}>
          <Text style={styles.skipText}>{isLast ? 'Maybe later' : 'Skip'}</Text>
        </Pressable>
      </View>
    </View>
  );
};

export { OnboardingScreen };

const ACCENT = '#7B78F2';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  slide: { width, height, justifyContent: 'flex-end' },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  slideContent: {
    paddingHorizontal: SPACING.xl,
  },
  eyebrow: {
    color: ACCENT,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: SPACING.sm,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 44,
    marginBottom: SPACING.md,
  },
  body: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 340,
  },
  dots: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.xs,
  },
  dot: {
    height: 7,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  actions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SPACING.xl,
  },
  primaryBtn: {
    backgroundColor: ACCENT,
    borderRadius: RADIUS.lg,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  skipText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '600',
  },
});
