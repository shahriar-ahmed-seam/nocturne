/**
 * Navigation route param types.
 * A single RootStackParamList keeps type-safety across the full tree.
 */

import type { StackScreenProps } from '@react-navigation/stack';
import type { NovelId, Chapter } from '../types/library.types';

export type RootStackParamList = {
  Onboarding: undefined;
  Library: undefined;
  NovelDetail: { novelId: NovelId };
  Reader: { novelId: NovelId; chapter: Chapter };
  Bookmarks: { novelId: NovelId };
  Download: undefined;
};

/**
 * Strongly-typed screen props powered by React Navigation.
 * Usage: `const Screen: React.FC<ScreenProps<'NovelDetail'>> = ({ route, navigation }) => ...`
 */
export type ScreenProps<T extends keyof RootStackParamList> = StackScreenProps<
  RootStackParamList,
  T
>;
