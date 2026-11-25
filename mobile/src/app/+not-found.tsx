import React from 'react';
import { View } from 'react-native';
import { Stack, router } from 'expo-router';
import { useTheme } from '@/theme';
import { Button, EmptyState } from '@/components/ui';

export default function NotFound() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: 'Not found' }} />
      <EmptyState
        icon="compass-outline"
        title="This page doesn't exist"
        body="The link may be broken or the post was removed."
        action={<Button title="Go to the feed" onPress={() => router.replace('/')} />}
      />
    </View>
  );
}
