import { Tabs } from "expo-router";
import { Platform, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { MiniPlayer } from "@/components/mini-player";
import { BounceIcon } from "@/components/fx";

const tabs = [
  { name: "index", title: "Home", icon: "home-filled" as const, activeIcon: "home" as const },
  { name: "library", title: "Library", icon: "library-music" as const, activeIcon: "library-music" as const },
  { name: "playlists", title: "Playlists", icon: "queue-music" as const, activeIcon: "queue-music" as const },
  { name: "settings", title: "Settings", icon: "tune" as const, activeIcon: "tune" as const },
];

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 10 : Math.max(insets.bottom, 10);
  const tabBarHeight = 64 + bottomPadding;

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: "#c8f34a",
        tabBarInactiveTintColor: "#777d86",
        tabBarStyle: {
          height: tabBarHeight,
          paddingTop: 9,
          paddingBottom: bottomPadding,
          backgroundColor: "#0d0f12",
          borderTopColor: "#24282d",
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 0.2,
        },
        }}
      >
        {tabs.map((tab) => (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: tab.title,
              tabBarIcon: ({ color, focused }) => (
                <BounceIcon focused={focused}>
                  <MaterialIcons name={focused ? tab.activeIcon : tab.icon} size={22} color={color} />
                </BounceIcon>
              ),
            }}
          />
        ))}
      </Tabs>
      <MiniPlayer bottom={tabBarHeight + 8} />
    </View>
  );
}
