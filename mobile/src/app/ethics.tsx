import React from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { brand, useTheme } from '@/theme';
import { Button, EmptyState, T } from '@/components/ui';

/** Renders the small Markdown subset the Code of Ethics uses (# headings, - bullets, paragraphs). */
function EthicsBody({ body }: { body: string }) {
  const { colors } = useTheme();
  const blocks = body.split('\n');
  return (
    <View style={{ gap: 8 }}>
      {blocks.map((line, i) => {
        const l = line.trim();
        if (!l) return null;
        if (l.startsWith('# ')) {
          return (
            <T key={i} v={i === 0 ? 'title' : 'heading'} style={{ marginTop: i === 0 ? 0 : 14 }} accessibilityRole="header">
              {l.slice(2)}
            </T>
          );
        }
        if (l.startsWith('- ') || l.startsWith('* ')) {
          return (
            <View key={i} style={{ flexDirection: 'row', gap: 10, paddingLeft: 4 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: brand.purpleStart, marginTop: 8 }} />
              <T v="body" color="body" style={{ flex: 1, lineHeight: 22 }}>{l.slice(2)}</T>
            </View>
          );
        }
        return (
          <T key={i} v="body" color="body" style={{ lineHeight: 22, color: colors.textBody }}>
            {l.replace(/\*\*(.+?)\*\*/g, '$1')}
          </T>
        );
      })}
    </View>
  );
}

export default function EthicsScreen() {
  const { colors } = useTheme();
  const q = useQuery({ queryKey: ['ethics'], queryFn: api.ethics, staleTime: 60 * 60_000 });
  if (q.isLoading) return <ActivityIndicator style={{ flex: 1, backgroundColor: colors.bg }} color={brand.purpleStart} />;
  if (q.isError || !q.data)
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <EmptyState icon="cloud-offline-outline" title="Couldn't load the Code of Ethics" body={(q.error as Error)?.message} action={<Button title="Retry" onPress={() => q.refetch()} />} />
      </View>
    );
  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
      <EthicsBody body={q.data.body} />
      <T v="small" color="tertiary" style={{ marginTop: 24 }}>
        Version {q.data.version}
        {q.data.publishedAt ? ` · published ${new Date(q.data.publishedAt).toLocaleDateString()}` : ''}
      </T>
    </ScrollView>
  );
}
