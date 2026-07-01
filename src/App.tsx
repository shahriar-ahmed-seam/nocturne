/**
 * App.tsx — root application component.
 *
 * Wires up:
 *   - NavigationContainer with theme-aware colours
 *   - SafeAreaProvider
 *   - GestureHandlerRootView
 *   - Stack navigator
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppNavigator } from './navigation/AppNavigator';
import { useTheme } from './hooks/useTheme';

const App: React.FC = () => {
  const palette = useTheme();

  const navTheme = {
    dark: palette.statusBar === 'light-content',
    colors: {
      primary: palette.accent,
      background: palette.background,
      card: palette.surface,
      text: palette.text,
      border: palette.border,
      notification: palette.accent,
    },
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer theme={navTheme}>
          <AppNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

export default App;
