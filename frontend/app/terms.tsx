import { LegalPage, SUPPORT_EMAIL } from "@/src/legal";

export default function Terms() {
  return (
    <LegalPage testID="terms-screen" title="Terms & Conditions" sections={[
      ["Acceptance", "By installing or using TIME AI you agree to these Terms. If you do not agree, please uninstall the app."],
      ["The service", "TIME AI is a personal productivity, planning and learning tool that runs offline on your device. Features may change between versions."],
      ["Your data & backups", "Your data is yours and lives on your device. You are responsible for keeping backups. We cannot recover data that is lost from a device, deleted, or never backed up."],
      ["Reminders & alarms", "Reminders and alarms are scheduled with your device's operating system. Battery optimisation, Do Not Disturb, disabled notifications, force-stopping the app or OS restrictions can delay or block them. Do not rely on TIME AI as your only alarm for critical, safety or medical purposes."],
      ["AI suggestions & estimates", "Plans, priorities, readiness scores, risk warnings and completion dates are produced by local rules from the data you enter. They are suggestions and estimates, not guarantees. You decide which changes to apply."],
      ["Not professional advice", "The Finance and Wellness modules are for personal organisation only. They are not financial, medical, legal or psychological advice and do not replace professional care."],
      ["Acceptable use", "Do not use the app for unlawful purposes. Do not reverse engineer or redistribute it except where the law allows."],
      ["Disclaimer", "The app is provided \"as is\" without warranties of any kind, to the extent the law allows."],
      ["Limitation of liability", "To the extent the law allows, the developer is not liable for indirect or consequential losses, missed deadlines or appointments, or lost data arising from use of the app."],
      ["Changes to these terms", "We may update these Terms. Continuing to use the app after an update means you accept the new Terms."],
      ["Contact", `Support and questions: ${SUPPORT_EMAIL}`],
    ]} />
  );
}
