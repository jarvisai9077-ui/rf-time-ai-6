import { Linking, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn, Glass, Screen, T } from "@/src/ui/kit";
import { reportError } from "@/src/ui/errorBus";

export const SUPPORT_EMAIL = "jarvisai9077@gmail.com";
export const LEGAL_UPDATED = "June 2026";

export async function emailSupport(subject = "TIME AI support") {
  const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
  try {
    await Linking.openURL(url);
  } catch { reportError(new Error(`No email app found. Please write to ${SUPPORT_EMAIL}`), "Email"); }
}

export function LegalPage({ title, sections, testID }: { title: string; sections: [string, string][]; testID: string }) {
  const insets = useSafeAreaInsets();
  return (
    <Screen testID={testID} title={title} subtitle={`Last updated ${LEGAL_UPDATED}`} bottomPad={insets.bottom + 32}>
      {sections.map(([h, body]) => (
        <Glass key={h} style={{ gap: 6 }}>
          <T v="headline">{h}</T>
          <T muted style={{ lineHeight: 21 }}>{body}</T>
        </Glass>
      ))}
      <View style={{ gap: 8 }}>
        <T v="caption" muted>Questions? Contact {SUPPORT_EMAIL}</T>
        <Btn testID={`${testID}-email-button`} kind="secondary" icon="mail-outline" label="Email support" onPress={() => emailSupport(`${title} question`)} />
      </View>
    </Screen>
  );
}
