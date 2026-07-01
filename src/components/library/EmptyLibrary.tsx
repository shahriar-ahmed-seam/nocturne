/**
 * EmptyLibrary — shown when no library folder is selected or the scan
 * found zero novels. Prompts the user to select a folder via SAF.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { SPACING, RADIUS } from '../../theme/colors';

interface EmptyLibraryProps {
  hasPermission: boolean;
  onSelectFolder: () => void;
}

const EmptyLibrary: React.FC<EmptyLibraryProps> = ({ hasPermission, onSelectFolder }) => {
  const palette = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <Text style={[styles.icon]}>📚</Text>
      <Text style={[styles.title, { color: palette.text }]}>
        {hasPermission ? 'No Novels Found' : 'Welcome to Nocturne'}
      </Text>
      <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
        {hasPermission
          ? 'Your library folder appears to be empty.\nAdd novel folders with a chapters/ directory.'
          : 'Select your library folder to get started.\nThe app will scan for novels automatically.'}
      </Text>
      <Pressable
        onPress={onSelectFolder}
        style={[styles.button, { backgroundColor: palette.accent }]}
      >
        <Text style={[styles.buttonText, { color: palette.onAccent }]}>
          {hasPermission ? 'Change Library Folder' : 'Select Library Folder'}
        </Text>
      </Pressable>
    </View>
  );
};

export { EmptyLibrary };

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  icon: {
    fontSize: 64,
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  button: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
