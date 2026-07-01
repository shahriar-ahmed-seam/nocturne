/**
 * DownloadScreen — import novels from a direct .zip URL.
 *
 * Layout:
 *   - URL text input
 *   - Download button
 *   - Animated progress bar with stage label
 *   - Error display with retry
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useTheme } from '../hooks/useTheme';
import { useDownloader } from '../hooks/useDownloader';
import { SPACING, RADIUS } from '../theme/colors';

import type { ScreenProps } from '../navigation/types';

const DownloadScreen: React.FC<ScreenProps<'Download'>> = ({ navigation }) => {
  const palette = useTheme();
  const insets = useSafeAreaInsets();
  const { startDownload, progress, reset, isActive } = useDownloader();
  const [url, setUrl] = useState('');

  const handleDownload = useCallback(() => {
    const trimmed = url.trim();
    if (!trimmed) return;
    void startDownload(trimmed);
  }, [url, startDownload]);

  const statusColor =
    progress.status === 'error'
      ? '#FF3B30'
      : progress.status === 'done'
      ? '#30D158'
      : palette.accent;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: palette.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + SPACING.lg, paddingBottom: insets.bottom + SPACING.lg },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigation.goBack()}>
            <Text style={[styles.backBtn, { color: palette.text }]}>← Back</Text>
          </Pressable>
          <Text style={[styles.title, { color: palette.text }]}>Import Novel</Text>
          <View style={{ width: 48 }} />
        </View>

        {/* Info card */}
        <View
          style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
        >
          <Text style={[styles.cardTitle, { color: palette.text }]}>Download from URL</Text>
          <Text style={[styles.cardDesc, { color: palette.textSecondary }]}>
            Paste a direct link to a .zip file containing novel folder(s). Each folder should have a
            chapters/ directory with .txt files.
          </Text>
        </View>

        {/* URL Input */}
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
              color: palette.text,
            },
          ]}
          placeholder="https://example.com/novel.zip"
          placeholderTextColor={palette.textSecondary}
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={!isActive}
          selectTextOnFocus
        />

        {/* Download button */}
        <Pressable
          onPress={handleDownload}
          disabled={isActive || !url.trim()}
          style={[
            styles.button,
            {
              backgroundColor: isActive || !url.trim() ? palette.border : palette.accent,
            },
          ]}
        >
          <Text style={[styles.buttonText, { color: palette.onAccent }]}>
            {isActive ? 'Downloading...' : 'Download & Import'}
          </Text>
        </Pressable>

        {/* Progress area */}
        {progress.status !== 'idle' && (
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(200)}
            style={[
              styles.progressCard,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            {/* Progress bar */}
            <View style={[styles.progressTrack, { backgroundColor: palette.border }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.round(progress.progress * 100)}%`,
                    backgroundColor: statusColor,
                  },
                ]}
              />
            </View>

            {/* Status label */}
            <Text style={[styles.statusLabel, { color: statusColor }]}>
              {progress.status.toUpperCase()}
            </Text>
            <Text style={[styles.statusMessage, { color: palette.textSecondary }]}>
              {progress.message}
            </Text>

            {/* Error details */}
            {progress.errorMessage && (
              <Text style={[styles.errorText, { color: '#FF3B30' }]}>{progress.errorMessage}</Text>
            )}

            {/* Done / Error actions */}
            {(progress.status === 'done' || progress.status === 'error') && (
              <View style={styles.actionRow}>
                {progress.status === 'error' && (
                  <Pressable
                    onPress={handleDownload}
                    style={[styles.actionBtn, { backgroundColor: palette.accent }]}
                  >
                    <Text style={{ color: palette.onAccent, fontSize: 13, fontWeight: '600' }}>
                      Retry
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => {
                    reset();
                    if (progress.status === 'done') {
                      navigation.goBack();
                    }
                  }}
                  style={[styles.actionBtn, { backgroundColor: palette.border }]}
                >
                  <Text style={{ color: palette.text, fontSize: 13, fontWeight: '600' }}>
                    {progress.status === 'done' ? 'Go to Library' : 'Dismiss'}
                  </Text>
                </Pressable>
              </View>
            )}
          </Animated.View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export { DownloadScreen };

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    paddingHorizontal: SPACING.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  backBtn: {
    fontSize: 16,
    fontWeight: '600',
    paddingVertical: SPACING.xs,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  card: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: SPACING.xs,
  },
  cardDesc: {
    fontSize: 13,
    lineHeight: 19,
  },
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    fontSize: 14,
    marginBottom: SPACING.md,
  },
  button: {
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  progressCard: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: SPACING.sm,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 2,
  },
  statusMessage: {
    fontSize: 13,
    marginBottom: SPACING.sm,
  },
  errorText: {
    fontSize: 12,
    marginBottom: SPACING.sm,
  },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  actionBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
});
