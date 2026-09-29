import * as BackgroundFetch from "expo-background-fetch";
import * as MediaLibrary from "expo-media-library";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

export const BACKGROUND_LIBRARY_TASK = "kora-background-library-scan";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function notifyLibraryRefresh(count: number) {
  if (Platform.OS === "web") return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Kora library refreshed",
      body: `${count} music track${count === 1 ? "" : "s"} available with updated metadata.`,
      data: { screen: "/library", source: "background-library-scan" },
    },
    trigger: null,
  });
}

async function countDeviceAudioAssets() {
  let count = 0;
  let cursor: string | undefined;
  let hasNextPage = true;
  while (hasNextPage) {
    const page = await MediaLibrary.getAssetsAsync({
      first: 100,
      ...(cursor ? { after: cursor } : {}),
      mediaType: "audio",
      sortBy: "default",
    });
    count += page.assets.length;
    cursor = page.endCursor;
    hasNextPage = page.hasNextPage && Boolean(cursor);
  }
  return count;
}

TaskManager.defineTask(BACKGROUND_LIBRARY_TASK, async () => {
  try {
    if (Platform.OS === "web" || !(await MediaLibrary.isAvailableAsync())) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }
    const permission = await MediaLibrary.getPermissionsAsync(false, ["audio"]);
    if (!permission.granted) return BackgroundFetch.BackgroundFetchResult.NoData;
    const count = await countDeviceAudioAssets();
    if (count > 0) await notifyLibraryRefresh(count);
    return count > 0 ? BackgroundFetch.BackgroundFetchResult.NewData : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function requestNotificationPermissionAsync() {
  if (Platform.OS === "web") return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function registerBackgroundLibraryScanAsync() {
  if (Platform.OS === "web") return false;
  const notificationsGranted = await requestNotificationPermissionAsync();
  if (!notificationsGranted) return false;
  const status = await BackgroundFetch.getStatusAsync();
  if (status !== BackgroundFetch.BackgroundFetchStatus.Available) return false;
  if (!(await TaskManager.isTaskRegisteredAsync(BACKGROUND_LIBRARY_TASK))) {
    await BackgroundFetch.registerTaskAsync(BACKGROUND_LIBRARY_TASK, { minimumInterval: 15 * 60, stopOnTerminate: false, startOnBoot: true });
  }
  return true;
}

export async function unregisterBackgroundLibraryScanAsync() {
  if (Platform.OS === "web") return;
  if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_LIBRARY_TASK)) {
    await BackgroundFetch.unregisterTaskAsync(BACKGROUND_LIBRARY_TASK);
  }
}
