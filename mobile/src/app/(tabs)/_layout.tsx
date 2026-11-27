import React, { useContext, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomTabBarHeightCallbackContext, Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { brand, useTheme } from '@/theme';
import { useAuth } from '@/lib/auth';
import { useUnreadCount } from '@/lib/unread';
import { haptic } from '@/lib/hooks';
import { NavScrollProvider, useNavProgress } from '@/lib/navScroll';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TABS: Record<string, { label: string; icon: IconName; active: IconName }> = {
  index: { label: 'Home', icon: 'home-outline', active: 'home' },
  explore: { label: 'Explore', icon: 'map-outline', active: 'map' },
  post: { label: 'Post', icon: 'add', active: 'add' },
  alerts: { label: 'Alerts', icon: 'notifications-outline', active: 'notifications' },
  account: { label: 'Account', icon: 'person-circle-outline', active: 'person-circle' },
};

function TabBar({ state, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const { colors } = useTheme();
  const { requireAuth } = useAuth();
  const unread = useUnreadCount();
  // The bar floats over the screens and slides down while the user scrolls down a list.
  const progress = useNavProgress();
  const reportHeight = useContext(BottomTabBarHeightCallbackContext);
  const [height, setHeight] = useState(56 + Math.max(insets.bottom, 8));
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [0, height + 2] });

  return (
    <Animated.View
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        setHeight(h);
        reportHeight?.(h);
      }}
      style={[
        styles.bar,
        {
          paddingBottom: Math.max(insets.bottom, 8),
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
          transform: [{ translateY }],
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const meta = TABS[route.name];
        if (!meta) return null;
        const focused = state.index === index;

        if (route.name === 'post') {
          return (
            <View key={route.key} style={styles.item}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Create a post"
                onPress={() => {
                  haptic.light();
                  requireAuth(() => router.push('/compose'), 'Sign in to post a problem in your district.');
                }}
                style={({ pressed }) => [styles.fabWrap, { transform: [{ scale: pressed ? 0.92 : 1 }] }]}
              >
                <LinearGradient colors={brand.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fab}>
                  <Ionicons name="add" size={28} color="#fff" />
                </LinearGradient>
              </Pressable>
            </View>
          );
        }

        const onPress = () => {
          const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            haptic.select();
            navigateToTab(route.key);
          }
        };
        const color = focused ? colors.text : colors.textSecondary;
        const badge = route.name === 'alerts' && unread > 0 ? unread : 0;

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={badge ? `${meta.label}, ${badge} unread` : meta.label}
            style={styles.item}
          >
            <View>
              <Ionicons name={focused ? meta.active : meta.icon} size={25} color={color} />
              {badge ? (
                <View style={[styles.badge, { borderColor: colors.bg }]}>
                  <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.label, { color, fontWeight: focused ? '700' : '500' }]}>{meta.label}</Text>
          </Pressable>
        );
      })}
    </Animated.View>
  );
}

export default function TabsLayout() {
  return (
    <NavScrollProvider>
      <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="explore" />
        <Tabs.Screen name="post" />
        <Tabs.Screen name="alerts" />
        <Tabs.Screen name="account" />
      </Tabs>
    </NavScrollProvider>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 48, gap: 2 },
  label: { fontSize: 10.5, letterSpacing: 0.1 },
  fabWrap: {
    shadowColor: brand.purpleEnd,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
    borderRadius: 18,
  },
  fab: { width: 52, height: 40, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -5,
    right: -9,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: brand.purpleStart,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
