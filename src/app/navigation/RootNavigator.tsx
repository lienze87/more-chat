import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {ChatScreen} from '../../ui/screens/ChatScreen';
import {SettingsScreen} from '../../ui/screens/SettingsScreen';
import {ExtensionsScreen} from '../../ui/screens/ExtensionsScreen';
import {FilePreviewScreen} from '../../ui/screens/FilePreviewScreen';
import {FilesScreen} from '../../ui/screens/FilesScreen';
import {useTheme} from '../../ui/theme/ThemeProvider';
import type {RootStackParamList} from '../../ui/navigation/types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const theme = useTheme();
  return (
    <Stack.Navigator
      initialRouteName="Chat"
      screenOptions={{
        headerShown: false,
        contentStyle: {backgroundColor: theme.colors.background},
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="Extensions" component={ExtensionsScreen} />
      <Stack.Screen name="Files" component={FilesScreen} />
      <Stack.Screen name="FilePreview" component={FilePreviewScreen} />
    </Stack.Navigator>
  );
}
