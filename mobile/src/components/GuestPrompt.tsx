import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Button, EmptyState, type IconName } from './ui';

/** Shown on member-only screens when browsing as a guest. */
export function GuestPrompt({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      body={body}
      action={
        <View style={{ gap: 10, width: 240 }}>
          <Button title="Sign in" onPress={() => router.push('/auth/login')} />
          <Button title="Create account" variant="secondary" onPress={() => router.push('/auth/signup')} />
        </View>
      }
    />
  );
}
