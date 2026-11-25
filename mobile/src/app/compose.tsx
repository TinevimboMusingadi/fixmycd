import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { SEVERITY_LABELS, TAXONOMY } from '@/lib/categories';
import { getCurrentCoords } from '@/lib/location';
import { pickPhoto, type PickedPhoto } from '@/lib/media';
import { haptic } from '@/lib/hooks';
import type { GeocodeResult, UploadResponse } from '@/lib/types';
import { brand, radius, severityMeta, tint, useTheme } from '@/theme';
import { LeafletMap } from '@/components/map/LeafletMap';
import type { LeafletMapHandle } from '@/components/map/types';
import { Button, CategoryChip, Field, Icon, IconButton, Pill, SeverityChip, T } from '@/components/ui';
import { toast } from '@/components/Toast';

const STEPS = ['What', 'Where', 'Evidence', 'Review'] as const;
type Coords = { lat: number; lng: number };

export default function ComposeScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, loading: authLoading } = useAuth();
  const qc = useQueryClient();

  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [severity, setSeverity] = useState(3);

  const [coords, setCoords] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);
  const [address, setAddress] = useState<GeocodeResult | null>(null);
  const [addressState, setAddressState] = useState<'idle' | 'loading' | 'none'>('idle');

  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [uploaded, setUploaded] = useState<UploadResponse | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Guests can't post: bounce to sign in.
  useEffect(() => {
    if (!authLoading && !user) router.replace('/auth/welcome');
  }, [authLoading, user]);

  const dirty = !!(title || description || category || photo);
  const close = () => {
    if (!dirty || submitting) return router.back();
    if (Platform.OS === 'web') return router.back();
    Alert.alert('Discard this post?', "What you've entered will be lost.", [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
  };

  const canNext =
    step === 0 ? title.trim().length >= 3 && !!category : step === 1 ? !!coords : step === 2 ? !uploading : true;

  const next = () => {
    if (!canNext) return;
    haptic.select();
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => (step === 0 ? close() : setStep((s) => s - 1));

  // --- Evidence --------------------------------------------------------------
  const startUpload = async (p: PickedPhoto) => {
    setUploading(true);
    setUploadError(null);
    setUploaded(null);
    try {
      const res = await api.upload({ uri: p.uri, name: p.name, mimeType: p.mimeType });
      setUploaded(res);
      haptic.success();
    } catch (e) {
      setUploadError((e as Error).message);
      haptic.error();
    } finally {
      setUploading(false);
    }
  };

  const choose = async (source: 'camera' | 'library') => {
    const r = await pickPhoto(source);
    if (!r.ok) {
      if (r.reason === 'denied') toast('Allow camera access in Settings to take a photo');
      else if (r.reason === 'error') toast(r.message || 'Could not open the camera');
      return;
    }
    setPhoto(r.photo);
    startUpload(r.photo);
  };

  // --- Submit ----------------------------------------------------------------
  const submit = async () => {
    if (!coords || !category) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      let imageUrl = uploaded?.url;
      if (photo && !imageUrl) {
        const res = await api.upload({ uri: photo.uri, name: photo.name, mimeType: photo.mimeType });
        setUploaded(res);
        imageUrl = res.url;
      }
      const cc = address?.countryCode?.toUpperCase();
      const created = await api.createPost({
        title: title.trim(),
        description: description.trim() || undefined,
        latitude: coords.lat,
        longitude: coords.lng,
        severity,
        category,
        subcategory: subcategory ?? undefined,
        infrastructureClass: category,
        infrastructureType: subcategory ?? undefined,
        postAction: 'failure',
        imageUrl,
        evidenceType: imageUrl ? 'photo' : 'eyewitness',
        addressLine: address?.addressLine || undefined,
        city: address?.city || undefined,
        postalCode: address?.postalCode || undefined,
        county: address?.county || undefined,
        stateProvince: address?.stateProvince || undefined,
        countryCode: cc && /^[A-Z]{2}$/.test(cc) ? cc : undefined,
      });
      haptic.success();
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['map'] });
      toast('Posted! Thanks for speaking up.');
      router.back();
      if (created?.id) setTimeout(() => router.push({ pathname: '/post/[id]', params: { id: created.id } }), 250);
    } catch (e) {
      haptic.error();
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top, backgroundColor: colors.bg }}>
        <View style={styles.topBar}>
          <IconButton name={step === 0 ? 'close' : 'arrow-back'} label={step === 0 ? 'Close' : 'Back'} onPress={back} />
          <T v="subheading" accessibilityRole="header">New post</T>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.progress} accessibilityLabel={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}>
          {STEPS.map((s, i) => (
            <View key={s} style={{ flex: 1, gap: 6 }}>
              <View style={[styles.bar, { backgroundColor: i <= step ? brand.purpleStart : colors.border }]} />
              <T v="tiny" color={i === step ? 'primary' : 'tertiary'}>{s}</T>
            </View>
          ))}
        </View>
      </View>

      {step === 1 ? (
        <WhereStep
          coords={coords}
          setCoords={setCoords}
          locating={locating}
          setLocating={setLocating}
          address={address}
          setAddress={setAddress}
          addressState={addressState}
          setAddressState={setAddressState}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 18 }} keyboardShouldPersistTaps="handled">
          {step === 0 ? (
            <>
              <Field
                label="What's the problem?"
                placeholder="e.g. Deep pothole on 4th Street"
                value={title}
                onChangeText={setTitle}
                maxLength={140}
                returnKeyType="next"
                hint={`${title.trim().length}/140 · at least 3 characters`}
              />
              <Field
                label="Details (optional)"
                placeholder="What did you see? How long has it been like this? Who is affected?"
                value={description}
                onChangeText={setDescription}
                multiline
                maxLength={5000}
              />
              <View style={{ gap: 8 }}>
                <T v="smallStrong" color="secondary">Type</T>
                <View style={styles.wrap}>
                  {TAXONOMY.map((c) => (
                    <Pill
                      key={c.name}
                      icon={c.icon}
                      label={c.name}
                      selected={category === c.name}
                      onPress={() => {
                        haptic.select();
                        setCategory(c.name);
                        setSubcategory(null);
                      }}
                    />
                  ))}
                </View>
                {category ? (
                  <>
                    <T v="smallStrong" color="secondary" style={{ marginTop: 6 }}>Kind of {category.toLowerCase()}</T>
                    <View style={styles.wrap}>
                      {TAXONOMY.find((c) => c.name === category)!.types.map((t) => (
                        <Pill key={t} label={t} selected={subcategory === t} onPress={() => setSubcategory(subcategory === t ? null : t)} />
                      ))}
                    </View>
                  </>
                ) : null}
              </View>
              <SeverityPicker value={severity} onChange={setSeverity} />
            </>
          ) : step === 2 ? (
            <EvidenceStep photo={photo} uploading={uploading} uploadError={uploadError} uploaded={!!uploaded} onChoose={choose} onRetry={() => photo && startUpload(photo)} onRemove={() => { setPhoto(null); setUploaded(null); setUploadError(null); }} />
          ) : (
            <ReviewStep
              title={title}
              description={description}
              category={category}
              subcategory={subcategory}
              severity={severity}
              coords={coords}
              address={address}
              photo={photo}
              userName={user?.displayName ?? 'You'}
              onEdit={setStep}
              error={submitError}
            />
          )}
        </ScrollView>
      )}

      <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12), backgroundColor: colors.bg }]}>
        {step < STEPS.length - 1 ? (
          <Button title={step === 2 && !photo ? 'Skip photo' : 'Continue'} size="lg" onPress={next} disabled={!canNext} loading={step === 2 && uploading} />
        ) : (
          <Button title="Post" icon="send" size="lg" onPress={submit} loading={submitting} />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function SeverityPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const { colors } = useTheme();
  const meta = severityMeta(value) ?? { color: brand.blue, label: '' };
  const info = SEVERITY_LABELS[value];
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <T v="smallStrong" color="secondary">How serious is it?</T>
        <View style={[styles.sevBadge, { backgroundColor: tint(meta.color, 0.15) }]}>
          <T v="smallStrong" color={meta.color}>{value} · {info.label}</T>
        </View>
      </View>
      <Slider
        minimumValue={1}
        maximumValue={5}
        step={1}
        value={value}
        onValueChange={(v) => {
          const n = Math.round(v);
          if (n !== value) {
            haptic.select();
            onChange(n);
          }
        }}
        minimumTrackTintColor={meta.color}
        maximumTrackTintColor={colors.border}
        thumbTintColor={Platform.OS === 'android' ? meta.color : undefined}
        accessibilityLabel="Severity"
        accessibilityValue={{ min: 1, max: 5, now: value, text: `${value} of 5, ${info.label}` }}
        style={{ height: 40 }}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T v="tiny" color="tertiary">Minor</T>
        <T v="small" color="secondary">{info.hint}</T>
        <T v="tiny" color="tertiary">Critical</T>
      </View>
    </View>
  );
}

function WhereStep(props: {
  coords: Coords | null;
  setCoords: (c: Coords) => void;
  locating: boolean;
  setLocating: (b: boolean) => void;
  address: GeocodeResult | null;
  setAddress: (a: GeocodeResult | null) => void;
  addressState: 'idle' | 'loading' | 'none';
  setAddressState: (s: 'idle' | 'loading' | 'none') => void;
}) {
  const { coords, setCoords, locating, setLocating, address, setAddress, addressState, setAddressState } = props;
  const { colors } = useTheme();
  const mapRef = useRef<LeafletMapHandle>(null);
  const [initial] = useState<Coords>(coords ?? { lat: 39.5, lng: -98.35 });
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const geoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ignore the map's own initial "move" (the default view) until we know where the user is.
  const acceptMoves = useRef(!!coords);

  const locate = async () => {
    setLocating(true);
    try {
      const c = await getCurrentCoords();
      setCoords(c);
      mapRef.current?.setView(c.lat, c.lng, 17);
    } catch (e) {
      toast((e as { denied?: boolean }).denied ? 'Location is off — move the map to the spot instead' : "Couldn't get your location");
    } finally {
      acceptMoves.current = true;
      setLocating(false);
    }
  };

  useEffect(() => {
    if (!coords) locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Address auto-fill (US Census geocoder via the API) for wherever the pin rests.
  useEffect(() => {
    if (!coords) return;
    if (geoTimer.current) clearTimeout(geoTimer.current);
    setAddressState('loading');
    geoTimer.current = setTimeout(() => {
      api
        .reverseGeocode(Number(coords.lat.toFixed(6)), Number(coords.lng.toFixed(6)))
        .then((a) => {
          setAddress(a);
          setAddressState('idle');
        })
        .catch(() => {
          setAddress(null);
          setAddressState('none');
        });
    }, 700);
    return () => {
      if (geoTimer.current) clearTimeout(geoTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords?.lat, coords?.lng]);

  const search = async () => {
    const q = query.trim();
    if (q.length < 3) return;
    setSearching(true);
    try {
      const r = await api.geocode(q);
      setCoords({ lat: r.lat, lng: r.lng });
      mapRef.current?.setView(r.lat, r.lng, 17);
    } catch (e) {
      toast((e as Error).message || 'No match for that address');
    } finally {
      setSearching(false);
    }
  };

  const addrText = address
    ? [address.addressLine, address.city, address.stateProvince, address.postalCode].filter(Boolean).join(', ')
    : null;

  return (
    <View style={{ flex: 1 }}>
      <LeafletMap
        ref={mapRef}
        style={{ flex: 1 }}
        center={initial}
        zoom={coords ? 17 : 4}
        onMove={(e) => {
          if (acceptMoves.current) setCoords({ lat: e.lat, lng: e.lng });
        }}
        accessibilityLabel="Move the map to put the pin on the problem"
      />
      {/* Fixed centre pin: the map moves underneath it. */}
      <View style={styles.pinWrap} pointerEvents="none">
        <Ionicons name="location" size={44} color={brand.purpleEnd} style={styles.pinShadow} />
        <View style={styles.pinDot} />
      </View>

      <View style={[styles.searchBar, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}>
        <Icon name="search" size={17} color={colors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={search}
          placeholder="Search an address or ZIP"
          placeholderTextColor={colors.textTertiary}
          returnKeyType="search"
          accessibilityLabel="Search an address"
          style={{ flex: 1, color: colors.text, fontSize: 15, height: 44 }}
        />
        {searching ? <ActivityIndicator color={brand.purpleStart} /> : null}
      </View>

      <Pressable
        onPress={locate}
        accessibilityRole="button"
        accessibilityLabel="Use my current location"
        style={[styles.locateBtn, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}
      >
        {locating ? <ActivityIndicator color={brand.purpleStart} /> : <Icon name="locate" size={22} color={colors.accentText} />}
      </Pressable>

      <View style={[styles.addressCard, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}>
        <View style={[styles.addrIcon, { backgroundColor: colors.accentSoft }]}>
          <Icon name="location" size={18} color={colors.accentText} />
        </View>
        <View style={{ flex: 1 }}>
          <T v="smallStrong" numberOfLines={2}>
            {addressState === 'loading' ? 'Finding address…' : addrText || (coords ? 'Pinned location' : 'Move the map to the problem')}
          </T>
          <T v="small" color="secondary">
            {coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : 'Waiting for location'}
            {addressState === 'none' && coords ? ' · no street address found' : ''}
          </T>
        </View>
      </View>
    </View>
  );
}

function EvidenceStep({
  photo,
  uploading,
  uploadError,
  uploaded,
  onChoose,
  onRetry,
  onRemove,
}: {
  photo: PickedPhoto | null;
  uploading: boolean;
  uploadError: string | null;
  uploaded: boolean;
  onChoose: (s: 'camera' | 'library') => void;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const { colors } = useTheme();
  if (photo) {
    return (
      <View style={{ gap: 12 }}>
        <T v="heading">Your photo</T>
        <View>
          <Image source={{ uri: photo.uri }} style={[styles.preview, { backgroundColor: colors.bgTertiary }]} contentFit="cover" />
          <View style={styles.previewBadge}>
            {uploading ? (
              <>
                <ActivityIndicator color="#fff" size="small" />
                <T v="smallStrong" color="#fff">Uploading…</T>
              </>
            ) : uploadError ? (
              <>
                <Icon name="alert-circle" size={16} color="#fff" />
                <T v="smallStrong" color="#fff">Upload failed</T>
              </>
            ) : uploaded ? (
              <>
                <Icon name="checkmark-circle" size={16} color="#fff" />
                <T v="smallStrong" color="#fff">Uploaded</T>
              </>
            ) : null}
          </View>
          <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel="Remove photo" style={styles.removeBtn}>
            <Icon name="close" size={18} color="#fff" />
          </Pressable>
        </View>
        {uploadError ? (
          <View style={{ gap: 8 }}>
            <T v="small" color="danger">{uploadError}</T>
            <Button title="Try again" variant="secondary" icon="refresh" onPress={onRetry} />
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title="Retake" variant="secondary" icon="camera-outline" style={{ flex: 1 }} onPress={() => onChoose('camera')} />
          <Button title="Library" variant="secondary" icon="images-outline" style={{ flex: 1 }} onPress={() => onChoose('library')} />
        </View>
      </View>
    );
  }
  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 4 }}>
        <T v="heading">Add evidence</T>
        <T v="body" color="secondary">A clear photo helps reviewers verify and prioritise your post. Use your own photo of the actual spot.</T>
      </View>
      <EvidenceButton icon="camera" title="Take a photo" body="Use the camera now" onPress={() => onChoose('camera')} />
      <EvidenceButton icon="images" title="Choose from library" body="Pick a photo you already took" onPress={() => onChoose('library')} />
    </View>
  );
}

function EvidenceButton({ icon, title, body, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; body: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.evidenceBtn, { borderColor: colors.border, backgroundColor: pressed ? colors.bgTertiary : colors.bgSecondary }]}
    >
      <View style={[styles.evidenceIcon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name={icon} size={26} color={colors.accentText} />
      </View>
      <View style={{ flex: 1 }}>
        <T v="bodyStrong">{title}</T>
        <T v="small" color="secondary">{body}</T>
      </View>
      <Icon name="chevron-forward" size={18} color={colors.textTertiary} />
    </Pressable>
  );
}

function ReviewStep(p: {
  title: string;
  description: string;
  category: string | null;
  subcategory: string | null;
  severity: number;
  coords: Coords | null;
  address: GeocodeResult | null;
  photo: PickedPhoto | null;
  userName: string | null;
  onEdit: (step: number) => void;
  error: string | null;
}) {
  const { colors } = useTheme();
  const addr = p.address ? [p.address.addressLine, p.address.city, p.address.stateProvince].filter(Boolean).join(', ') : null;
  return (
    <View style={{ gap: 14 }}>
      <T v="heading">Review your post</T>
      <View style={[styles.reviewCard, { borderColor: colors.border, backgroundColor: colors.bg }]}>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          <SeverityChip severity={p.severity} />
          <CategoryChip category={p.category} subcategory={p.subcategory} />
        </View>
        <T v="bodyStrong" style={{ marginTop: 8, fontSize: 17 }}>{p.title.trim()}</T>
        {p.description.trim() ? <T v="body" color="body" style={{ marginTop: 4 }}>{p.description.trim()}</T> : null}
        {p.photo ? <Image source={{ uri: p.photo.uri }} style={[styles.reviewPhoto, { backgroundColor: colors.bgTertiary }]} contentFit="cover" /> : null}
      </View>
      <ReviewRow icon="create-outline" label="Title, type & severity" value={`${p.category ?? ''}${p.subcategory ? ` · ${p.subcategory}` : ''} · ${SEVERITY_LABELS[p.severity].label}`} onEdit={() => p.onEdit(0)} />
      <ReviewRow
        icon="location-outline"
        label="Location"
        value={addr || (p.coords ? `${p.coords.lat.toFixed(5)}, ${p.coords.lng.toFixed(5)}` : 'Not set')}
        onEdit={() => p.onEdit(1)}
      />
      <ReviewRow icon="camera-outline" label="Evidence" value={p.photo ? '1 photo' : 'No photo'} onEdit={() => p.onEdit(2)} />
      <View style={[styles.ethicsNote, { backgroundColor: colors.bgSecondary }]}>
        <Icon name="shield-checkmark-outline" size={18} color={colors.accentText} />
        <T v="small" color="secondary" style={{ flex: 1 }}>
          By posting you confirm this is a real problem you've seen, pinned where it actually is, in line with the{' '}
          <T v="smallStrong" color="accent" onPress={() => router.push('/ethics')}>Code of Ethics</T>.
        </T>
      </View>
      {p.error ? (
        <View style={[styles.errorBox, { borderColor: tint(brand.red, 0.4), backgroundColor: tint(brand.red, 0.08) }]}>
          <Icon name="alert-circle" size={18} color={brand.red} />
          <T v="small" color="danger" style={{ flex: 1 }}>{p.error}</T>
        </View>
      ) : null}
    </View>
  );
}

function ReviewRow({ icon, label, value, onEdit }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string; onEdit: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel={`Edit ${label}`} style={styles.reviewRow}>
      <Icon name={icon} size={20} color={colors.textSecondary} />
      <View style={{ flex: 1 }}>
        <T v="small" color="secondary">{label}</T>
        <T v="body" numberOfLines={2}>{value}</T>
      </View>
      <T v="smallStrong" color="accent">Edit</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topBar: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6 },
  progress: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingBottom: 10 },
  bar: { height: 4, borderRadius: 2 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sevBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  footer: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  pinWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  pinShadow: { marginTop: -44, textShadowColor: 'rgba(0,0,0,0.25)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 2 } },
  pinDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.35)', marginTop: -2 },
  searchBar: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  locateBtn: {
    position: 'absolute',
    right: 14,
    bottom: 108,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  addressCard: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
  addrIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  preview: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.lg },
  previewBadge: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  removeBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  evidenceBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radius.lg, borderWidth: 1 },
  evidenceIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  reviewCard: { borderWidth: 1, borderRadius: radius.lg, padding: 14 },
  reviewPhoto: { width: '100%', aspectRatio: 16 / 10, borderRadius: radius.md, marginTop: 10 },
  reviewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  ethicsNote: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.md },
  errorBox: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: radius.md, borderWidth: 1, alignItems: 'center' },
});
