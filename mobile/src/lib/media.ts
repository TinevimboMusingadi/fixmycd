import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export interface PickedPhoto {
  uri: string;
  width: number;
  height: number;
  mimeType: string;
  name: string;
}

const MAX_EDGE = 1600;

/** Downscale and re-encode as JPEG so uploads stay small (the API caps files at 10 MB). */
async function normalise(asset: ImagePicker.ImagePickerAsset): Promise<PickedPhoto> {
  if (Platform.OS === 'web') {
    return { uri: asset.uri, width: asset.width, height: asset.height, mimeType: asset.mimeType ?? 'image/jpeg', name: asset.fileName ?? 'photo.jpg' };
  }
  const ctx = ImageManipulator.manipulate(asset.uri);
  const longest = Math.max(asset.width, asset.height);
  if (longest > MAX_EDGE) {
    if (asset.width >= asset.height) ctx.resize({ width: MAX_EDGE, height: null });
    else ctx.resize({ width: null, height: MAX_EDGE });
  }
  const ref = await ctx.renderAsync();
  const out = await ref.saveAsync({ compress: 0.75, format: SaveFormat.JPEG });
  return { uri: out.uri, width: out.width, height: out.height, mimeType: 'image/jpeg', name: `photo-${Date.now()}.jpg` };
}

export type PickResult = { ok: true; photo: PickedPhoto } | { ok: false; reason: 'cancelled' | 'denied' | 'error'; message?: string };

export async function pickPhoto(source: 'camera' | 'library'): Promise<PickResult> {
  try {
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return { ok: false, reason: 'denied' };
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, exif: false };
    const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets?.[0]) return { ok: false, reason: 'cancelled' };
    return { ok: true, photo: await normalise(result.assets[0]) };
  } catch (e) {
    return { ok: false, reason: 'error', message: (e as Error).message };
  }
}
