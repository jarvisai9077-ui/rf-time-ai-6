import { LegalPage, SUPPORT_EMAIL } from "@/src/legal";

export default function Privacy() {
  return (
    <LegalPage testID="privacy-screen" title="Privacy Policy" sections={[
      ["Summary", "TIME AI is an offline app. Everything you enter (tasks, events, notes, study data, finance, wellness, family and admin records) is stored only on your device. We do not run servers that receive your data, and the app does not need an account."],
      ["Data we collect", "None. TIME AI has no analytics, advertising SDKs, telemetry, tracking or remote crash reporting. The developer cannot see your data."],
      ["Data stored on your device", "Your records are kept in the app's private storage, which Android's app sandbox and device encryption protect. An optional PIN is stored only as a salted SHA-256 hash in the system secure store (Android Keystore-backed). Attachments you add in Life Admin are copied into the app's private folder."],
      ["Permissions", "Notifications: used only to show the reminders, alarms, timers and briefings you schedule. Exact alarms and boot completion let scheduled reminders fire on time and survive device restarts. File access happens only when you choose a file to import or attach. No location, contacts, camera or microphone access is requested."],
      ["The AI Agent", "The Agent is a rule-based engine that runs on your device. Your commands are never sent to any AI service or server."],
      ["Sharing & exports", "Data leaves your device only when you export or share a file (backup, calendar .ics, CSV, reports) through the system share sheet. Exported backups are plain JSON and are NOT encrypted, so store them carefully."],
      ["Children", "Kids Mode is a simplified local learning area. It collects no personal information and has no remote tracking. Parents can protect it with a PIN."],
      ["Deleting your data", "You can delete individual items, clear memory, or erase everything in Settings › Data › Erase all data. Uninstalling the app also removes all of its local data."],
      ["Changes", "If this policy changes, the updated version will appear in the app with a new date."],
      ["Contact", `Privacy questions: ${SUPPORT_EMAIL}`],
    ]} />
  );
}
