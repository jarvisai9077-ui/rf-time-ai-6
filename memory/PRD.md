# TIME AI — Offline Personal Life OS (PRD)

## Original problem statement
Build the complete RF TIME AI master spec: a fully offline, Android-first personal OS (calendar, AI time agent, student/kids learning, Life OS, tasks, goals/habits/routines, notes/workspaces/databases/projects, clock/alarms/focus, family, finance, wellness, life admin, analytics, automations, search, backup) with iOS-inspired glassmorphism and brand orange #FF5E00. No backend, no cloud AI, no login. The user asked for the whole app built in one go.

## Architecture
- Expo Router (SDK 58) frontend only. The FastAPI backend is unused.
- `src/store/db.ts`: local store with 41 collections, saved per collection to AsyncStorage (debounced and flushed when the app goes to the background), versioned schema migrations, an undo stack, soft delete/trash, backup validate/merge/replace, integrity check/repair and erase-all.
- Engines (`src/engine/`):
  - `time` handles natural-language dates.
  - `planner` handles free slots, time blocking, energy windows, conflicts, deadline risk, time budget and what-if.
  - `learning` handles SM-2 spaced repetition, measured mastery, recommendations, readiness estimate, notes→quiz/cards and syllabus parsing.
  - `agent` is a rule-based NL interpreter that turns text into validated actions.
  - `actions` runs the execution queue: validate, execute, undo, retry, duplicate prevention and recovery after a restart.
  - `automation` handles trigger→condition→action rules.
  - `notify` handles local notifications with quiet hours and permission states.
  - `io` handles JSON/ICS/CSV import and export.
  - `reports` builds briefings and the weekly review.
- UI kit lives in `src/ui/`: glass cards, sheets, toasts with undo, confirm dialogs, generic FormSheet and CollectionList.
- Tabs: Today, Calendar, Agent, Hub. Native tabs are used on iOS 26+.

## Implemented (2026-06)
All modules from the spec have screens: Today (customizable widgets), Calendar, Agent, Hub, Tasks, Notes + editor, Goals/Habits/Routines, Projects, Workspaces, Databases, Student, Kids, Clock, Life OS, Finance, Wellness, Family, Admin, Analytics, Automations, Queue, What-If, Briefings, Search and Settings.

Testing agent result: 95% pass. All 21 module tiles open without crashing, and data persists after a reload.

## Known limitations (documented in the app)
- The agent uses local rules, not an LLM.
- No offline OCR, PDF parsing, speech recognition or text-to-speech.
- Native widgets and exact alarms need a native build.
- Automations only run while the app is open.
- Backups are unencrypted JSON.

## Backlog
- P1: Native Android home-screen widgets (needs a native build). Add a date-picker UI and drag-to-reschedule on the calendar.
- P2: Optional on-device LLM/speech when available. Encrypted backup export. Add more localization strings.

## Iteration 2 (2026-06)
- Performance: data loads in parallel at module start; native splash shown until ready (no JS spinner); app-lock check skipped unless enabled; automations/notification setup deferred 800ms; Today computations memoized; Clock re-renders only the ticking display; calendar year view lightweight; tasks/notes paginated (60); agent list virtualized; entering animations removed.
- Error handling: global error bus + JS global handler → toasts; all buttons/rows wrapped in safe handlers; persistence retries on failure; agent parse errors caught.
- Keyboard: Next/Done focus chaining in forms, interactive dismiss, tab bar hides on keyboard, Android resize mode, Modal translucency for keyboard-controller.
- Notifications: Android channels (reminders, alarms), contextual permission request on first reminder, tap-to-open routes, cancel on edit/delete; permissions POST_NOTIFICATIONS, SCHEDULE_EXACT_ALARM, USE_EXACT_ALARM, RECEIVE_BOOT_COMPLETED, WAKE_LOCK, VIBRATE. OS-scheduled so they fire when app is closed (validate on native build).
- Privacy Policy (/privacy) and Terms (/terms) with support email jarvisai9077@gmail.com, linked from Hub footer and Settings › About.
