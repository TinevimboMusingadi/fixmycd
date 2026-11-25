import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { webUrl } from '@/lib/config';
import { compactNumber, percent, usd } from '@/lib/format';
import { brand, radius, tint, useTheme } from '@/theme';
import { GuestPrompt } from '@/components/GuestPrompt';
import { Button, EmptyState, Icon, type IconName, Skeleton, T } from '@/components/ui';

interface Tile {
  label: string;
  value: string;
  icon: IconName;
  color: string;
  sub?: string;
}

function delta(now: number, before?: number): string | undefined {
  if (before === undefined) return undefined;
  const d = now - before;
  if (d === 0) return 'same as previous period';
  return `${d > 0 ? '+' : '−'}${compactNumber(Math.abs(d))} vs previous period`;
}

export default function AnalyticsScreen() {
  const { colors } = useTheme();
  const { user, loading } = useAuth();
  const q = useQuery({ queryKey: ['analytics', 'summary'], queryFn: api.analyticsSummary, enabled: !!user });

  if (!user && !loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <GuestPrompt icon="stats-chart-outline" title="Analytics for members" body="Sign in to see how problems across the district are being handled." />
      </View>
    );
  }

  const s = q.data?.data;
  const tiles: Tile[] = s
    ? [
        { label: 'Total posts', value: compactNumber(s.totalReports), icon: 'documents-outline', color: brand.purpleStart, sub: delta(s.totalReports, s.previousPeriod?.totalReports) },
        { label: 'Open backlog', value: compactNumber(s.openBacklog), icon: 'time-outline', color: brand.yellow, sub: delta(s.openBacklog, s.previousPeriod?.openBacklog) },
        { label: 'Critical', value: compactNumber(s.criticalReports), icon: 'warning-outline', color: brand.red, sub: delta(s.criticalReports, s.previousPeriod?.criticalReports) },
        { label: 'Reporters', value: compactNumber(s.uniqueReporters), icon: 'people-outline', color: brand.blue },
        { label: 'Acceptance rate', value: percent(s.acceptanceRate), icon: 'checkmark-done-outline', color: brand.green },
        { label: 'Resolution rate', value: percent(s.resolutionRate), icon: 'construct-outline', color: brand.green },
        { label: 'Avg. age', value: `${Math.round(s.avgAgeDays)}d`, icon: 'hourglass-outline', color: brand.orange },
        {
          label: 'Time to resolve',
          value: s.avgTimeToResolutionDays === null ? '—' : `${Math.round(s.avgTimeToResolutionDays)}d`,
          icon: 'speedometer-outline',
          color: brand.blue,
        },
        { label: 'Est. repair cost', value: usd(s.estimatedCostTotal), icon: 'cash-outline', color: brand.purpleEnd },
        { label: 'People affected', value: compactNumber(s.peopleAffectedTotal), icon: 'body-outline', color: brand.orange },
      ]
    : [];

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => {
            q.refetch();
          }} tintColor={brand.purpleStart} />}
    >
      <T v="body" color="secondary" style={{ marginBottom: 14 }}>
        A live summary of every post on FixMyDistrict.
      </T>
      {q.isError ? (
        <EmptyState icon="cloud-offline-outline" title="Couldn't load analytics" body={(q.error as Error).message} action={<Button title="Retry" onPress={() => q.refetch()} />} />
      ) : (
        <View style={styles.grid}>
          {(s ? tiles : Array.from({ length: 8 }, () => null)).map((tile, i) => (
            <View key={i} style={[styles.tile, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
              {tile ? (
                <>
                  <View style={[styles.tileIcon, { backgroundColor: tint(tile.color, 0.14) }]}>
                    <Icon name={tile.icon} size={18} color={tile.color} />
                  </View>
                  <T v="title" style={{ fontSize: 26, marginTop: 10 }} accessibilityLabel={`${tile.label}: ${tile.value}`}>
                    {tile.value}
                  </T>
                  <T v="smallStrong" color="secondary">{tile.label}</T>
                  {tile.sub ? <T v="tiny" color="tertiary" style={{ marginTop: 2 }}>{tile.sub}</T> : null}
                </>
              ) : (
                <View style={{ gap: 10 }}>
                  <Skeleton width={32} height={32} radius={10} />
                  <Skeleton width="60%" height={22} />
                  <Skeleton width="80%" height={12} />
                </View>
              )}
            </View>
          ))}
        </View>
      )}
      <Button
        title="Full dashboard on the web"
        icon="open-outline"
        variant="secondary"
        style={{ marginTop: 20 }}
        onPress={() => WebBrowser.openBrowserAsync(webUrl('/dashboard/analytics'))}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48.4%', flexGrow: 1, flexBasis: '45%', padding: 14, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, minHeight: 128 },
  tileIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
