import { Alert } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { downloadAsync, cacheDirectory } from 'expo-file-system/legacy';

export async function savePhotoToDevice(publicUrl: string): Promise<void> {
  // 1. Request permission
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permission needed', 'Allow photo library access to save this photo.');
    return;
  }

  // 2. Download to a temp file in the cache directory
  const filename = `roamies-${Date.now()}.jpg`;
  const localUri = (cacheDirectory ?? '') + filename;

  const result = await downloadAsync(publicUrl, localUri);
  if (result.status !== 200) {
    Alert.alert('Download failed', 'Could not save the photo. Please try again.');
    return;
  }

  // 3. Save to camera roll
  await MediaLibrary.saveToLibraryAsync(result.uri);
  Alert.alert('Saved', 'Photo saved to your camera roll.');
}
