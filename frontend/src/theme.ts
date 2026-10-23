// TIME AI design tokens. Light + dark. Brand orange from the spec.
import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#F5F6F8",
  onSurface: "#1C1C1E",
  surfaceSecondary: "rgba(255,255,255,0.78)",
  onSurfaceSecondary: "#1C1C1E",
  surfaceTertiary: "rgba(118,118,128,0.12)",
  onSurfaceTertiary: "#3A3A3C",
  surfaceInverse: "#1C1C1E",
  onSurfaceInverse: "#FFFFFF",
  muted: "#8E8E93",
  brand: "#FF5E00",
  onBrand: "#FFFFFF",
  brandPrimary: "#FF5E00",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#FF6600",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#FFF0E6",
  onBrandTertiary: "#B33F00",
  success: "#1F9D55",
  onSuccess: "#FFFFFF",
  warning: "#C77700",
  onWarning: "#FFFFFF",
  error: "#D92D20",
  onError: "#FFFFFF",
  info: "#0A6CFF",
  onInfo: "#FFFFFF",
  border: "rgba(60,60,67,0.14)",
  borderStrong: "rgba(60,60,67,0.3)",
  divider: "rgba(60,60,67,0.12)",
  glass: "rgba(255,255,255,0.72)",
  glassBorder: "rgba(255,255,255,0.9)",
  blobA: "rgba(255,94,0,0.16)",
  blobB: "rgba(255,160,90,0.14)",
  overlay: "rgba(0,0,0,0.35)",
  sheet: "#FFFFFF",
};

const dark: typeof light = {
  surface: "#0E0E10",
  onSurface: "#F2F2F7",
  surfaceSecondary: "rgba(44,44,46,0.78)",
  onSurfaceSecondary: "#F2F2F7",
  surfaceTertiary: "rgba(118,118,128,0.24)",
  onSurfaceTertiary: "#D1D1D6",
  surfaceInverse: "#F2F2F7",
  onSurfaceInverse: "#1C1C1E",
  muted: "#98989F",
  brand: "#FF6A14",
  onBrand: "#FFFFFF",
  brandPrimary: "#FF6A14",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#FF7A2E",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "rgba(255,102,0,0.18)",
  onBrandTertiary: "#FFB98A",
  success: "#32D074",
  onSuccess: "#0E0E10",
  warning: "#FFB020",
  onWarning: "#0E0E10",
  error: "#FF6B5E",
  onError: "#0E0E10",
  info: "#5AA2FF",
  onInfo: "#0E0E10",
  border: "rgba(255,255,255,0.1)",
  borderStrong: "rgba(255,255,255,0.25)",
  divider: "rgba(255,255,255,0.08)",
  glass: "rgba(36,36,40,0.72)",
  glassBorder: "rgba(255,255,255,0.08)",
  blobA: "rgba(255,94,0,0.22)",
  blobB: "rgba(255,140,60,0.10)",
  overlay: "rgba(0,0,0,0.6)",
  sheet: "#1C1C1E",
};

export type ThemeColors = typeof light;
export const defaultScheme = "light" satisfies ColorScheme;
export const themes: { light: ThemeColors; dark?: ThemeColors } = { light, dark };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };
export const type = {
  largeTitle: { fontSize: 32, fontWeight: "800" as const, letterSpacing: -0.6 },
  title: { fontSize: 22, fontWeight: "700" as const, letterSpacing: -0.3 },
  headline: { fontSize: 17, fontWeight: "600" as const },
  body: { fontSize: 15, fontWeight: "400" as const },
  caption: { fontSize: 12, fontWeight: "500" as const },
};

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system === "dark" ? "dark" : "light";
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
