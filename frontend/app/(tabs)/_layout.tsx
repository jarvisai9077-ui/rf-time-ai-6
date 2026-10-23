import { Tabs } from "expo-router";
import { NativeTabs } from "expo-router/native-tabs";
import { Platform } from "react-native";
import { usesNativeTabs } from "@/src/navigation";
import { useTheme } from "@/src/theme";
import { Icon } from "@/src/ui/kit";

export default function TabsLayout() {
  const { colors } = useTheme();
  if (usesNativeTabs) {
    return (
      <NativeTabs tintColor={colors.brandPrimary}>
        <NativeTabs.Trigger name="index"><NativeTabs.Trigger.Icon sf="sun.max.fill" /><NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label></NativeTabs.Trigger>
        <NativeTabs.Trigger name="calendar"><NativeTabs.Trigger.Icon sf="calendar" /><NativeTabs.Trigger.Label>Calendar</NativeTabs.Trigger.Label></NativeTabs.Trigger>
        <NativeTabs.Trigger name="agent"><NativeTabs.Trigger.Icon sf="sparkles" /><NativeTabs.Trigger.Label>Agent</NativeTabs.Trigger.Label></NativeTabs.Trigger>
        <NativeTabs.Trigger name="hub"><NativeTabs.Trigger.Icon sf="square.grid.2x2.fill" /><NativeTabs.Trigger.Label>Hub</NativeTabs.Trigger.Label></NativeTabs.Trigger>
      </NativeTabs>
    );
  }
  const icon = (name: string) => ({ color, focused }: { color: string; focused: boolean }) => <Icon name={focused ? name : `${name}-outline`} size={23} color={color} />;
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.brandPrimary,
      tabBarInactiveTintColor: colors.muted,
      tabBarStyle: { backgroundColor: colors.sheet, borderTopColor: colors.divider, ...(Platform.OS === "web" ? { height: 64 } : {}) },
      tabBarItemStyle: { alignSelf: "center" },
      tabBarLabelStyle: { fontWeight: "600", fontSize: 11 },
    }}>
      <Tabs.Screen name="index" options={{ title: "Today", tabBarIcon: icon("sunny"), tabBarButtonTestID: "tab-today" } as any} />
      <Tabs.Screen name="calendar" options={{ title: "Calendar", tabBarIcon: icon("calendar"), tabBarButtonTestID: "tab-calendar" } as any} />
      <Tabs.Screen name="agent" options={{ title: "Agent", tabBarIcon: icon("sparkles"), tabBarButtonTestID: "tab-agent" } as any} />
      <Tabs.Screen name="hub" options={{ title: "Hub", tabBarIcon: icon("grid"), tabBarButtonTestID: "tab-hub" } as any} />
    </Tabs>
  );
}
