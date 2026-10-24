import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { AppState, LogBox, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { StatusBar } from "expo-status-bar";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { tickAutomations } from "@/src/engine/automation";
import { checkPin, hasPin } from "@/src/security";
import { db, flush, hydrate, useSettings, useStore } from "@/src/store/db";
import { radius, setColorScheme, spacing, useTheme } from "@/src/theme";
import { Backdrop, Btn, Icon, T } from "@/src/ui/kit";
import { UIProvider } from "@/src/ui/overlay";
import { initNotifications, listenForTaps } from "@/src/engine/notify";
import { reportError } from "@/src/ui/errorBus";

LogBox.ignoreAllLogs(true);
// Keep the native splash only until local data is read (tens of ms) — no JS spinner screen.
SplashScreen.preventAutoHideAsync().catch(() => {});
// Start reading local data immediately at module load, before the first render.
const hydration = hydrate().catch((e) => reportError(e, "Loading data"));
// Global safety net: unexpected JS errors become a toast instead of a silent failure.
const g: any = globalThis as any;
if (g.ErrorUtils?.setGlobalHandler) {
  const prev = g.ErrorUtils.getGlobalHandler?.();
  g.ErrorUtils.setGlobalHandler((e: any, fatal?: boolean) => { reportError(e, "Unexpected error"); if (fatal && prev) prev(e, fatal); });
}

function Lock({ onUnlock }: { onUnlock: () => void }) {
  const { colors } = useTheme();
  const [pin, setPin] = useState(""); const [err, setErr] = useState("");
  const tryIt = async () => { if (await checkPin(pin)) onUnlock(); else { setErr("Incorrect PIN"); setPin(""); } };
  return (
    <View testID="lock-screen" style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.lg }}>
      <Backdrop />
      <Icon name="lock-closed" size={42} color={colors.brandPrimary} />
      <T v="title">TIME AI is locked</T>
      <TextInput testID="lock-pin-input" value={pin} onChangeText={setPin} secureTextEntry keyboardType="number-pad" maxLength={8} placeholder="Enter PIN" placeholderTextColor={colors.muted} onSubmitEditing={tryIt} style={{ width: 220, textAlign: "center", fontSize: 24, letterSpacing: 8, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: 12, color: colors.onSurface }} />
      {err ? <Text testID="lock-error" style={{ color: colors.error }}>{err}</Text> : null}
      <Btn testID="lock-unlock-button" label="Unlock" onPress={tryIt} style={{ width: 220 }} />
    </View>
  );
}

function Shell() {
  const ready = useStore((s) => s.ready);
  const persistError = useStore((s) => s.persistError);
  const st = useSettings();
  const { colors, scheme } = useTheme();
  const [locked, setLocked] = useState<boolean | null>(null);

  useEffect(() => { hydration.then(() => {}); }, []);
  useEffect(() => { setColorScheme(st.theme === "system" ? null : st.theme); }, [st.theme]);
  useEffect(() => {
    if (!ready) return;
    if (!st.appLock) setLocked(false); // no secure-store round-trip unless app lock is on
    else hasPin().then((h) => setLocked(h)).catch(() => setLocked(false));
    // Heavy/non-visual work runs after the first frame & animations, never blocking launch.
    const task = setTimeout(() => { initNotifications(); tickAutomations().catch((e) => reportError(e, "Automations")); }, 800);
    const unTap = listenForTaps((route) => { try { router.push(route as any); } catch {} });
    const iv = setInterval(() => tickAutomations().catch(() => {}), 60000);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") tickAutomations().catch(() => {});
      else flush().catch(() => {}); // persist immediately when backgrounded (process may be killed)
    });
    return () => { clearInterval(iv); sub.remove(); clearTimeout(task); unTap(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => { if (ready && locked !== null) SplashScreen.hideAsync().catch(() => {}); }, [ready, locked]);
  if (!ready || locked === null) return <View style={{ flex: 1, backgroundColor: colors.surface }} />;
  if (locked) return <Lock onUnlock={() => setLocked(false)} />;
  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />
      {persistError ? (
        <Pressable testID="persist-error-banner" onPress={() => db.clearPersistError()} style={{ position: "absolute", top: 50, left: 16, right: 16, backgroundColor: colors.error, borderRadius: radius.md, padding: 12 }}>
          <Text style={{ color: colors.onError }}>{persistError} (tap to dismiss)</Text>
        </Pressable>
      ) : null}
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <ErrorBoundary>
        <KeyboardProvider>
          <UIProvider>
            <Shell />
          </UIProvider>
        </KeyboardProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
