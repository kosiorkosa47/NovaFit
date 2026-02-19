/** Lightweight i18n — EN default, PL optional via Settings */

export type Lang = "en" | "pl";

const STORAGE_KEY = "novafit-lang";

export function getLang(): Lang {
  if (typeof window === "undefined") return "en";
  return (localStorage.getItem(STORAGE_KEY) as Lang) ?? "en";
}

export function setLang(lang: Lang) {
  localStorage.setItem(STORAGE_KEY, lang);
}

const translations = {
  // Dashboard
  "phone_data": { en: "Phone Data", pl: "Dane z telefonu" },
  "phone_sensors": { en: "Phone Sensors", pl: "Sensory telefonu" },
  "health_connect": { en: "Health Connect", pl: "Health Connect" },
  "web_sensors": { en: "Web Sensors", pl: "Sensory web" },
  "simulated": { en: "Simulated", pl: "Symulacja" },
  "steps": { en: "Steps", pl: "Kroki" },
  "heart_rate": { en: "Heart Rate", pl: "Tętno" },
  "sleep": { en: "Sleep", pl: "Sen" },
  "calories": { en: "Calories", pl: "Kalorie" },
  "distance": { en: "Distance", pl: "Dystans" },
  "stress": { en: "Stress", pl: "Stres" },
  "steps_unit": { en: "steps", pl: "kroków" },
  "hours": { en: "hours", pl: "godz" },
  "burned": { en: "burned", pl: "spalone" },
  "ai_analysis": { en: "AI Agent Analysis", pl: "Analiza AI agentów" },
  "charts_7d": { en: "7-Day Charts", pl: "Wykresy — 7 dni" },
  "daily_goals": { en: "Daily Goals", pl: "Cele dzienne" },
  "water": { en: "Water", pl: "Woda" },
  "glasses": { en: "glasses", pl: "szklanek" },
  "exercise": { en: "Exercise", pl: "Ćwiczenia" },
  "today": { en: "Today", pl: "Dziś" },
  "avg": { en: "avg", pl: "śr" },
  "sleep_hours": { en: "Sleep (hours)", pl: "Sen (godz)" },
  "heart_rate_bpm": { en: "Heart Rate (bpm)", pl: "Tętno (bpm)" },
  "calories_burned": { en: "Calories Burned", pl: "Kalorie spalone" },

  // Day labels
  "mon": { en: "Mon", pl: "Pn" },
  "tue": { en: "Tue", pl: "Wt" },
  "wed": { en: "Wed", pl: "Śr" },
  "thu": { en: "Thu", pl: "Cz" },
  "fri": { en: "Fri", pl: "Pt" },
  "sat": { en: "Sat", pl: "Sb" },
  "sun": { en: "Sun", pl: "Nd" },

  // Insights
  "steps_goal_reached": { en: "Steps Goal", pl: "Cel kroków" },
  "steps_goal_msg_good": {
    en: "Congratulations! You've hit {steps} steps — daily goal reached. Keep it up!",
    pl: "Gratulacje! Zrobiłeś {steps} kroków — cel dzienny osiągnięty. Utrzymaj to tempo!",
  },
  "steps_goal_msg_mid": {
    en: "You have {steps} steps. {remaining} more to reach 8,000. Try a 15-min walk.",
    pl: "Masz {steps} kroków. Do celu 8 000 brakuje {remaining}. Spróbuj 15-min spaceru.",
  },
  "activity": { en: "Activity", pl: "Aktywność" },
  "steps_goal_msg_low": {
    en: "Only {steps} steps. Recommendation: get up and walk — even a short stroll helps.",
    pl: "Tylko {steps} kroków. Rekomendacja: wstań i przejdź się — nawet krótki spacer poprawi samopoczucie.",
  },
  "hr_label": { en: "Heart Rate", pl: "Tętno" },
  "hr_msg_low": {
    en: "Resting heart rate {bpm} bpm — excellent, indicates good fitness.",
    pl: "Spoczynkowe tętno {bpm} bpm — bardzo dobre, świadczy o dobrej kondycji.",
  },
  "hr_msg_high": {
    en: "Heart rate {bpm} bpm is elevated. Consider breathing exercises or less caffeine.",
    pl: "Tętno {bpm} bpm jest podwyższone. Rozważ ćwiczenia oddechowe lub redukcję kofeiny.",
  },
  "hr_msg_normal": {
    en: "Heart rate {bpm} bpm — normal. Regular exercise can lower it further.",
    pl: "Tętno {bpm} bpm — w normie. Regularna aktywność fizyczna może je jeszcze obniżyć.",
  },
  "sleep_label": { en: "Sleep", pl: "Sen" },
  "sleep_msg_good": {
    en: "{hours}h of sleep — excellent. Good sleep is the foundation of health.",
    pl: "{hours}h snu — doskonale. Dobry sen to fundament zdrowia i regeneracji.",
  },
  "sleep_msg_mid": {
    en: "Only {hours}h of sleep. Target is 7-9h. Try going to bed 30 min earlier.",
    pl: "Tylko {hours}h snu. Cel to 7-9h. Spróbuj kłaść się 30 min wcześniej.",
  },
  "cal_label": { en: "Calories", pl: "Kalorie" },
  "cal_msg": {
    en: "Burned: ~{cals} kcal from activity. Remember to stay hydrated!",
    pl: "Spalone: ~{cals} kcal z aktywności. Pamiętaj o nawodnieniu!",
  },

  // Detail panel
  "goal": { en: "Goal", pl: "Cel" },
  "progress": { en: "Progress", pl: "Postęp" },
  "hourly": { en: "Hourly Breakdown", pl: "Rozkład godzinowy" },
  "tips": { en: "Tips", pl: "Wskazówki" },
  "weekly_avg": { en: "Weekly Average", pl: "Średnia tygodniowa" },
  "best_day": { en: "Best Day", pl: "Najlepszy dzień" },
  "trend": { en: "Trend", pl: "Trend" },
  "improving": { en: "Improving", pl: "Poprawa" },
  "declining": { en: "Declining", pl: "Spadek" },
  "stable": { en: "Stable", pl: "Stabilny" },
  "tap_collapse": { en: "Tap to collapse", pl: "Kliknij aby zwinąć" },

  // Settings
  "language": { en: "Language", pl: "Język" },
  "language_desc": { en: "App display language", pl: "Język wyświetlania aplikacji" },

  // History
  "no_conversations": { en: "No conversations yet. Start chatting to see your history here.", pl: "Brak rozmów. Zacznij czat, żeby zobaczyć historię." },
  "start_conversation": { en: "Start a conversation", pl: "Rozpocznij rozmowę" },
  "conversation_history": { en: "Conversation History", pl: "Historia rozmów" },
  "clear": { en: "Clear", pl: "Wyczyść" },
} as const;

type TranslationKey = keyof typeof translations;

export function t(key: TranslationKey, lang?: Lang): string {
  const l = lang ?? getLang();
  const entry = translations[key];
  if (!entry) return key;
  return entry[l] ?? entry.en;
}

/** Template string with {variable} replacement */
export function tt(key: TranslationKey, vars: Record<string, string | number>, lang?: Lang): string {
  let str = t(key, lang);
  for (const [k, v] of Object.entries(vars)) {
    str = str.replace(`{${k}}`, String(v));
  }
  return str;
}

/** Get day labels for current week */
export function getDayLabels(lang?: Lang): string[] {
  const l = lang ?? getLang();
  const dayKeys: TranslationKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const today = new Date().getDay();
  return Array.from({ length: 7 }, (_, i) => {
    const d = (today - 6 + i + 7) % 7;
    return i === 6 ? t("today", l) : t(dayKeys[d], l);
  });
}
