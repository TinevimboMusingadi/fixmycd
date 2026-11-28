import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export interface PickedPhoto {
  uri: string;
  width: number;
  height: number;
  mimeType: string;
  name: string;
  /** Taken with the camera just now (vs picked from the library). */
  fromCamera?: boolean;
}

const MAX_EDGE = 1600;
/** Library photos up to this size are sent as-is, so the server can read their Content Credentials and
 * metadata to spot AI-generated images (it strips the metadata before storing). */
const KEEP_ORIGINAL_MAX_BYTES = 8 * 1024 * 1024;
const KEEP_ORIGINAL_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Downscale and re-encode as JPEG so uploads stay small (the API caps files at 10 MB). */
async function normalise(asset: ImagePicker.ImagePickerAsset, fromCamera: boolean): Promise<PickedPhoto> {
  const keepOriginal =
    !fromCamera && !!asset.mimeType && KEEP_ORIGINAL_TYPES.includes(asset.mimeType) && !!asset.fileSize && asset.fileSize <= KEEP_ORIGINAL_MAX_BYTES;
  if (Platform.OS === 'web' || keepOriginal) {
    const ext = asset.mimeType === 'image/png' ? 'png' : asset.mimeType === 'image/webp' ? 'webp' : 'jpg';
    return { uri: asset.uri, width: asset.width, height: asset.height, mimeType: asset.mimeType ?? 'image/jpeg', name: `photo-${Date.now()}.${ext}`, fromCamera };
  }
  const ctx = ImageManipulator.manipulate(asset.uri);
  const longest = Math.max(asset.width, asset.height);
  if (longest > MAX_EDGE) {
    if (asset.width >= asset.height) ctx.resize({ width: MAX_EDGE, height: null });
    else ctx.resize({ width: null, height: MAX_EDGE });
  }
  const ref = await ctx.renderAsync();
  const out = await ref.saveAsync({ compress: 0.75, format: SaveFormat.JPEG });
  return { uri: out.uri, width: out.width, height: out.height, mimeType: 'image/jpeg', name: `photo-${Date.now()}.jpg`, fromCamera };
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
    return { ok: true, photo: await normalise(result.assets[0], source === 'camera') };
  } catch (e) {
    return { ok: false, reason: 'error', message: (e as Error).message };
  }
}
