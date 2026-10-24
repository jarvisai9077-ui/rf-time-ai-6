import { Image } from "expo-image";
import { View } from "react-native";

const LOGO = require("@/assets/images/logo.png");

/** TIME AI app logo (rounded app-icon mark). */
export function BrandLogo({ size = 40, testID }: { size?: number; testID?: string }) {
  return (
    <View testID={testID} accessible accessibilityRole="image" accessibilityLabel="TIME AI logo" style={{ width: size, height: size, borderRadius: size * 0.225, overflow: "hidden" }}>
      <Image source={LOGO} style={{ width: size, height: size }} contentFit="cover" />
    </View>
  );
}
