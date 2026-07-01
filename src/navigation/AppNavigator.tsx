/**
 * AppNavigator — React Navigation stack.
 *
 * Onboarding → Library → NovelDetail → Reader
 *                    ↘ Bookmarks   ↘ Download
 *
 * A headerless stack (headerShown: false) since each screen manages its own
 * chrome for the immersive / parallax UIs. The initial route is decided once
 * at mount from the persisted `hasSeenOnboarding` flag.
 */

import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import type { RootStackParamList } from './types';

import { OnboardingScreen } from '../screens/OnboardingScreen';
import { LibraryScreen } from '../screens/LibraryScreen';
import { NovelDetailScreen } from '../screens/NovelDetailScreen';
import { ReaderScreen } from '../screens/ReaderScreen';
import { BookmarksScreen } from '../screens/BookmarksScreen';
import { DownloadScreen } from '../screens/DownloadScreen';
import { hasSeenOnboarding } from '../services/SettingsService';

const Stack = createStackNavigator<RootStackParamList>();

const AppNavigator: React.FC = () => (
  <Stack.Navigator
    initialRouteName={hasSeenOnboarding() ? 'Library' : 'Onboarding'}
    screenOptions={{
      headerShown: false,
      animationEnabled: true,
      gestureEnabled: true,
    }}
  >
    <Stack.Screen
      name="Onboarding"
      component={OnboardingScreen}
      options={{ gestureEnabled: false }}
    />
    <Stack.Screen name="Library" component={LibraryScreen} />
    <Stack.Screen name="NovelDetail" component={NovelDetailScreen} />
    <Stack.Screen
      name="Reader"
      component={ReaderScreen}
      options={{ gestureEnabled: false }} // swipe is handled by our Pan gesture
    />
    <Stack.Screen name="Bookmarks" component={BookmarksScreen} />
    <Stack.Screen name="Download" component={DownloadScreen} />
  </Stack.Navigator>
);

export { AppNavigator };
