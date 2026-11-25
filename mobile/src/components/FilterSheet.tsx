import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { FILTER_STATUSES, TAXONOMY } from '@/lib/categories';
import type { FeedFilters } from '@/lib/types';
import { Sheet } from './Sheet';
import { Button, Pill, T } from './ui';

export const RADIUS_OPTIONS = [5, 25, 100] as const;

export function FilterSheet({
  visible,
  onClose,
  value,
  onApply,
  radiusKm,
  onRadius,
  showRadius,
}: {
  visible: boolean;
  onClose: () => void;
  value: FeedFilters;
  onApply: (f: FeedFilters) => void;
  radiusKm: number;
  onRadius: (km: number) => void;
  showRadius: boolean;
}) {
  const [draft, setDraft] = useState<FeedFilters>(value);
  const [km, setKm] = useState(radiusKm);
  useEffect(() => {
    if (visible) {
      setDraft(value);
      setKm(radiusKm);
    }
  }, [visible, value, radiusKm]);

  const toggle = <K extends keyof FeedFilters>(key: K, v: FeedFilters[K]) =>
    setDraft((d) => ({ ...d, [key]: d[key] === v ? undefined : v }));

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Filter posts"
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button
            title="Reset"
            variant="secondary"
            style={{ flex: 1 }}
            onPress={() => setDraft({ keyword: draft.keyword })}
          />
          <Button
            title="Show posts"
            style={{ flex: 2 }}
            onPress={() => {
              onApply(draft);
              if (showRadius) onRadius(km);
              onClose();
            }}
          />
        </View>
      }
    >
      {showRadius ? (
        <Group title="Distance">
          {RADIUS_OPTIONS.map((r) => (
            <Pill key={r} label={`${r} km`} selected={km === r} onPress={() => setKm(r)} />
          ))}
        </Group>
      ) : null}
      <Group title="Status">
        {FILTER_STATUSES.map((s) => (
          <Pill key={s.value} label={s.label} selected={draft.status === s.value} onPress={() => toggle('status', s.value)} />
        ))}
      </Group>
      <Group title="Severity">
        {[
          { v: 3, l: 'Medium +' },
          { v: 4, l: 'Critical only' },
        ].map((s) => (
          <Pill key={s.v} label={s.l} selected={draft.severityMin === s.v} onPress={() => toggle('severityMin', s.v)} />
        ))}
      </Group>
      <Group title="Type">
        {TAXONOMY.map((c) => (
          <Pill key={c.name} icon={c.icon} label={c.name} selected={draft.category === c.name} onPress={() => toggle('category', c.name)} />
        ))}
      </Group>
    </Sheet>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 14 }}>
      <T v="smallStrong" color="secondary" style={{ marginBottom: 8 }}>
        {title}
      </T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
    </View>
  );
}

export function activeFilterCount(f: FeedFilters): number {
  return [f.status, f.category, f.severityMin].filter((v) => v !== undefined && v !== '').length;
}
