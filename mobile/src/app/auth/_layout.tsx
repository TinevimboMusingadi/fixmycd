import { Stack } from 'expo-router';
import { useTheme } from '@/theme';

export default function AuthLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerTitle: '',
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="pending" />
      <Stack.Screen name="social" />
    </Stack>
  );
}
