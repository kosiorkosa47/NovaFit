/**
 * Smart fallback responses when AWS Bedrock is unavailable (quota exceeded, auth issues, etc.)
 * Generates context-aware responses based on wearable data and user message.
 * Used automatically when Nova models hit daily token limits.
 */

import type { WearableSnapshot } from "@/lib/integrations/wearables.mock";
import type { AnalyzerResult, PlanRecommendation, MonitorResult } from "@/lib/orchestrator/types";
import { log } from "@/lib/utils/logging";

// ---------------------------------------------------------------------------
// Keyword detection helpers
// ---------------------------------------------------------------------------

function detectTopics(message: string): string[] {
  const lower = message.toLowerCase();
  const topics: string[] = [];

  if (/tired|exhausted|fatigue|sleepy|drained|zmęczon|zmeczon|wyczerpan|senno/.test(lower)) topics.push("fatigue");
  if (/stress|anxious|overwhelm|nervous|tense|stres|nerwow|zestresow/.test(lower)) topics.push("stress");
  if (/sore|pain|hurt|ache|injury|ból|bol[ie]|boli/.test(lower)) topics.push("pain");
  if (/motivat|lazy|unmotivat|bored|motywac|leniw/.test(lower)) topics.push("motivation");
  if (/weight|diet|eat|food|calories|dieta|jedzeni|kalori/.test(lower)) topics.push("nutrition");
  if (/sleep|insomnia|rest|\bsen\b|bezsenno|spać|spac|nie.*śpi|nie.*spi|budzę|budze/.test(lower)) topics.push("sleep");
  if (/run|workout|gym|exercise|training|trening|bieg|ćwicz|cwicz/.test(lower)) topics.push("exercise");
  if (/headache|migrain|migre|ból głowy|bol glowy/.test(lower)) topics.push("headache");
  if (/happy|great|good|awesome|fantastic|amazing|full of energy|pełen energii|swietn|świetn|super się czuj|super sie czuj|doskonale|wspaniale/.test(lower)) topics.push("positive");
  // Also detect low energy as fatigue (Polish: "mało energii", "brak energii")
  if (/low energy|no energy|mało energii|malo energii|brak energii/.test(lower) && !topics.includes("fatigue")) topics.push("fatigue");

  // If "positive" is detected alongside negative topics, negative wins (user saying "low energy" shouldn't be positive)
  if (topics.includes("positive") && topics.length > 1) {
    const negativeTopics = topics.filter(t => t !== "positive");
    if (negativeTopics.length > 0) {
      return negativeTopics;
    }
  }

  return topics.length > 0 ? topics : ["general"];
}

function getEnergyFromWearable(w: WearableSnapshot): number {
  let score = 50;
  if (w.steps > 8000) score += 10;
  else if (w.steps < 3000) score -= 10;

  const sleepNum = parseFloat(String(w.sleepHours));
  if (sleepNum >= 7.5) score += 15;
  else if (sleepNum < 6) score -= 15;
  else if (sleepNum < 7) score -= 5;

  if (w.stressLevel === "low") score += 10;
  else if (w.stressLevel === "high") score -= 20;

  return Math.max(10, Math.min(95, score));
}

// ---------------------------------------------------------------------------
// Response templates per topic
// ---------------------------------------------------------------------------

interface TopicResponses {
  summary: string;
  reply: string;
  diet: string[];
  exercise: string[];
  hydration: string;
  recovery: string;
  feedbackPrompt: string;
}

const TOPIC_RESPONSES: Record<string, TopicResponses> = {
  fatigue: {
    summary: "Signs of fatigue detected. Your body is signaling a need for rest and recovery-focused nutrition.",
    reply: "I can see you're feeling tired — that's completely valid. Based on your recent activity data, your body could use some targeted recovery. I've put together a lighter plan that prioritizes energy restoration without overloading you.",
    diet: [
      "Iron-rich meal: grilled salmon or lentil soup with spinach to support energy levels",
      "Complex carbs: sweet potato or brown rice to provide sustained fuel",
      "Evening snack: banana with almond butter — magnesium supports muscle recovery",
      "Avoid heavy meals close to bedtime — keep dinner light and protein-focused"
    ],
    exercise: [
      "15-minute gentle walk outdoors — natural light helps regulate your circadian rhythm",
      "5-minute stretching routine focusing on shoulders, neck, and lower back",
      "Skip high-intensity training today — recovery is part of progress"
    ],
    hydration: "Aim for 2L of water throughout the day. Add a slice of lemon for extra vitamin C. Herbal tea in the evening can help with relaxation.",
    recovery: "Prioritize 7-8 hours of sleep tonight. Consider a warm shower 30 minutes before bed to lower core temperature and promote drowsiness.",
    feedbackPrompt: "How did you sleep last night? Would you like tomorrow's plan to be more active or keep it recovery-focused?"
  },
  stress: {
    summary: "Elevated stress signals detected. Recommending stress-reduction activities paired with calming nutrition.",
    reply: "It sounds like you're dealing with some stress. That's okay — let's work with your body, not against it. I've created a plan focused on calming your nervous system while keeping you nourished and gently active.",
    diet: [
      "Magnesium-rich foods: dark chocolate (70%+), avocado, or almonds to support nervous system",
      "Omega-3 boost: walnuts, chia seeds, or grilled fish to reduce inflammation",
      "Warm chamomile or valerian root tea in the evening",
      "Limit caffeine after 2 PM to help your body wind down naturally"
    ],
    exercise: [
      "10-minute guided breathing exercise (try box breathing: 4 seconds in, 4 hold, 4 out, 4 hold)",
      "20-minute yoga flow focusing on hip openers and forward folds",
      "Light evening walk — no headphones, just observe your surroundings"
    ],
    hydration: "Stay well hydrated — dehydration amplifies cortisol. Try warm water with lemon in the morning.",
    recovery: "Try a 10-minute body scan meditation before sleep. Keep screens away 30 minutes before bed. Write down 3 things that went well today.",
    feedbackPrompt: "What usually helps you decompress? Would you prefer more physical activity or mindfulness-based recovery?"
  },
  pain: {
    summary: "User reports physical discomfort. Recommending anti-inflammatory nutrition and gentle mobility work.",
    reply: "Sorry to hear you're dealing with some discomfort. Let's focus on reducing inflammation and supporting your body's natural healing. Here's a gentle plan — listen to your body and skip anything that increases pain.",
    diet: [
      "Anti-inflammatory foods: turmeric (with black pepper for absorption), ginger tea, berries",
      "Lean protein for tissue repair: chicken breast, eggs, or tofu",
      "Colorful vegetables: broccoli, bell peppers, leafy greens — rich in antioxidants",
      "Avoid processed foods and excess sugar — they can increase inflammation"
    ],
    exercise: [
      "Gentle mobility work: slow joint circles for all major joints (5 minutes)",
      "Foam rolling or self-massage on non-painful areas (10 minutes)",
      "If pain persists beyond 3 days, please consult a healthcare professional"
    ],
    hydration: "Extra hydration supports recovery — aim for 2.5L today. Consider adding electrolytes if you've been sweating.",
    recovery: "Apply ice (15 min on, 15 off) if there's swelling. Elevate the affected area when resting. Sleep is your best healer.",
    feedbackPrompt: "Where exactly do you feel the discomfort? I can tailor tomorrow's mobility work to avoid aggravating it."
  },
  motivation: {
    summary: "User may be experiencing low motivation. Focus on small, achievable wins to rebuild momentum.",
    reply: "Feeling unmotivated is more common than you think — and it's often a sign your body or mind needs something different, not that something is wrong with you. Let's start with tiny wins today. Even 5 minutes counts.",
    diet: [
      "Dopamine-supporting breakfast: eggs, bananas, and dark leafy greens",
      "Balanced lunch with protein + complex carbs to stabilize blood sugar and mood",
      "Snack: trail mix with dark chocolate — a small reward that supports focus"
    ],
    exercise: [
      "Just 5 minutes of movement — that's today's goal. A short walk, some stretches, or dancing to one song",
      "If 5 minutes feels good, try 5 more. But 5 is enough to call it a win",
      "Set out your workout clothes tonight so tomorrow morning is one decision easier"
    ],
    hydration: "Start your day with a full glass of water before anything else. Dehydration can mimic fatigue and low mood.",
    recovery: "Be kind to yourself today. Progress isn't always linear. Reflect on one thing you did well this week.",
    feedbackPrompt: "What's one small thing that usually makes you feel accomplished? I'll build tomorrow's plan around that."
  },
  nutrition: {
    summary: "User is focused on diet and nutrition. Providing balanced meal guidance with practical portions.",
    reply: "Great that you're thinking about nutrition! Let me put together a balanced approach. Remember — consistency beats perfection. Small, sustainable changes create lasting results.",
    diet: [
      "Breakfast: overnight oats with berries, chia seeds, and a scoop of protein (~400 kcal)",
      "Lunch: grilled chicken salad with quinoa, avocado, and olive oil dressing (~550 kcal)",
      "Dinner: baked fish with roasted vegetables and sweet potato (~500 kcal)",
      "Snacks: apple with peanut butter, or Greek yogurt with honey (~200 kcal each)"
    ],
    exercise: [
      "30-minute moderate-intensity activity of your choice",
      "2-minute walk after each meal to support digestion and blood sugar regulation"
    ],
    hydration: "2-2.5L of water daily. A glass before each meal can help with portion awareness.",
    recovery: "Track how different meals make you feel over the next 3 days. Energy, mood, and satiety are important signals.",
    feedbackPrompt: "Do you have any food allergies or dietary preferences I should know about? Are you focused on weight management, energy, or general health?"
  },
  sleep: {
    summary: "Sleep-related concerns detected. Focus on sleep hygiene and circadian rhythm support.",
    reply: "Sleep is the foundation of everything — energy, recovery, mood, and performance. Let's optimize your evening routine and address what might be disrupting your rest.",
    diet: [
      "Evening meal rich in tryptophan: turkey, cottage cheese, or pumpkin seeds",
      "Avoid heavy or spicy food within 3 hours of bedtime",
      "Warm milk with honey or tart cherry juice (natural melatonin source) before bed",
      "Cut caffeine by early afternoon — it stays in your system 6-8 hours"
    ],
    exercise: [
      "Morning or afternoon exercise only — evening workouts can delay sleep onset",
      "10-minute gentle stretching before bed to release physical tension",
      "Try progressive muscle relaxation: tense each muscle group for 5 seconds, then release"
    ],
    hydration: "Front-load your water intake — drink more in the morning and taper off by evening to minimize nighttime bathroom trips.",
    recovery: "Aim for the same bedtime and wake time every day (yes, weekends too). Keep your bedroom cool (18-20°C), dark, and quiet.",
    feedbackPrompt: "What time do you usually go to bed and wake up? Is it trouble falling asleep, staying asleep, or both?"
  },
  exercise: {
    summary: "User is focused on physical activity. Providing balanced training guidance with recovery considerations.",
    reply: "Love the focus on movement! Whether you're a beginner or experienced, consistency and smart recovery are key. Here's a balanced plan based on your current activity level.",
    diet: [
      "Pre-workout: banana or toast with honey 30-60 minutes before exercise",
      "Post-workout within 45 min: protein shake or chicken with rice to support recovery",
      "Stay on top of overall protein: aim for 1.6-2g per kg body weight if training regularly"
    ],
    exercise: [
      "Warm-up: 5 min dynamic stretches (leg swings, arm circles, hip rotations)",
      "Main: 30-40 min at moderate intensity — keep conversation pace if building base fitness",
      "Cool-down: 5 min slow walk + static stretches for worked muscle groups"
    ],
    hydration: "Drink 500ml 2 hours before exercise, sip during, and rehydrate fully after. For sessions >60 min, add electrolytes.",
    recovery: "Rest days are when you get stronger. Alternate hard and easy days. Sleep 7-9 hours for optimal muscle repair.",
    feedbackPrompt: "What type of exercise do you enjoy most? And how many days per week are you currently active?"
  },
  headache: {
    summary: "User reports headache symptoms. Recommending hydration, screen breaks, and tension-relief strategies.",
    reply: "Headaches can have many triggers — dehydration, tension, screen time, or poor sleep. Let's address the most common causes and help you feel better.",
    diet: [
      "Hydrate immediately — dehydration is the #1 headache trigger",
      "Magnesium-rich foods: almonds, dark chocolate, spinach",
      "Avoid artificial sweeteners and excess processed food today",
      "Small frequent meals to keep blood sugar stable"
    ],
    exercise: [
      "Gentle neck rolls and shoulder shrugs (2 minutes, very slow)",
      "20-20-20 rule for screens: every 20 min, look at something 20 feet away for 20 seconds",
      "Skip intense workouts if headache is active — light walk only"
    ],
    hydration: "Drink a full glass of water now. Aim for at least 2.5L today. Add a pinch of salt for electrolyte balance.",
    recovery: "Dim your screen brightness. Consider a 15-minute power nap if possible. Cool compress on forehead or back of neck.",
    feedbackPrompt: "How often do you get headaches? If this is recurring, it might be worth discussing with a doctor."
  },
  positive: {
    summary: "User reports feeling good! Capitalizing on positive momentum with an optimized performance plan.",
    reply: "That's awesome — let's ride this wave of good energy! Days like today are perfect for building positive habits and pushing slightly beyond your comfort zone. Here's an optimized plan to make the most of it.",
    diet: [
      "Fuel for performance: protein-rich breakfast with whole grains and healthy fats",
      "Colorful lunch: the more colors on your plate, the wider the nutrient spectrum",
      "Pre-dinner snack: apple with almond butter or trail mix",
      "Celebrate with a treat you enjoy — balance is key to sustainability"
    ],
    exercise: [
      "Today's a great day for a challenging workout — try something new or increase intensity slightly",
      "30-45 min at a pace that pushes you but still feels enjoyable",
      "Add one mobility or flexibility exercise you've been skipping"
    ],
    hydration: "Keep the hydration momentum going — 2L minimum. Consider coconut water for natural electrolytes.",
    recovery: "Journal what made today great — replicate these conditions. Maintain your sleep schedule even when feeling good.",
    feedbackPrompt: "What made today feel so good? I'd love to incorporate more of that into your routine."
  },
  general: {
    summary: "General wellness check. Providing a balanced all-round plan based on current activity data.",
    reply: "Thanks for checking in! Based on your recent activity data, here's a well-rounded plan to keep you on track. Small consistent steps add up to big changes over time.",
    diet: [
      "Balanced plate: 1/4 protein, 1/4 complex carbs, 1/2 vegetables",
      "Include healthy fats: olive oil, avocado, or nuts with at least one meal",
      "Aim for 25-30g fiber from whole foods (fruits, vegetables, legumes, whole grains)"
    ],
    exercise: [
      "30 minutes of moderate activity — walking, cycling, swimming, or your favorite sport",
      "Include 2-3 minutes of mobility work: hip circles, shoulder rolls, ankle rotations",
      "Take movement breaks every hour if you have a desk job"
    ],
    hydration: "Target 2L of water throughout the day. Set reminders if you tend to forget.",
    recovery: "7-8 hours of sleep is your foundation. Wind down 30 minutes before bed with no screens.",
    feedbackPrompt: "How are you feeling overall? Any specific area you'd like me to focus on — energy, fitness, nutrition, or stress?"
  }
};

// ---------------------------------------------------------------------------
// Topic-specific nutrition insights (used when USDA/Nutritionix unavailable)
// ---------------------------------------------------------------------------

function getNutritionTipsForTopic(topic: string): string[] {
  const tips: Record<string, string[]> = {
    fatigue: [
      "Iron-rich foods: spinach (100g): ~23 kcal | P: 3g | C: 4g | Fe: 2.7mg",
      "Complex carbs: sweet potato (150g): ~130 kcal | P: 2g | C: 30g | Fiber: 4g",
      "Protein boost: eggs (2 large): ~140 kcal | P: 12g | C: 1g | F: 10g"
    ],
    stress: [
      "Magnesium-rich: dark chocolate 70% (30g): ~170 kcal | P: 2g | Mg: 65mg",
      "Omega-3: salmon fillet (150g): ~280 kcal | P: 30g | F: 18g | Omega-3: 2.5g",
      "Calming tea: chamomile or valerian — 0 kcal, natural relaxant"
    ],
    sleep: [
      "Tryptophan source: turkey breast (100g): ~135 kcal | P: 30g | Tryptophan: 0.3g",
      "Melatonin boost: tart cherry juice (240ml): ~140 kcal | natural melatonin",
      "Evening snack: warm milk with honey (250ml): ~180 kcal | P: 8g | Ca: 300mg"
    ],
    exercise: [
      "Pre-workout: banana (120g): ~105 kcal | P: 1g | C: 27g | K: 422mg",
      "Post-workout: chicken breast (150g): ~230 kcal | P: 43g | C: 0g | F: 5g",
      "Recovery shake: whey protein + milk (300ml): ~250 kcal | P: 30g | C: 15g"
    ],
    nutrition: [
      "Balanced plate: 1/4 protein (~200 kcal) + 1/4 carbs (~200 kcal) + 1/2 veggies (~100 kcal)",
      "Daily fiber target: 25-30g from whole grains, fruits, vegetables, legumes",
      "Healthy fats: avocado (100g): ~160 kcal | F: 15g | Fiber: 7g | K: 485mg"
    ],
    positive: [
      "Performance fuel: oatmeal with berries (300g): ~300 kcal | P: 10g | C: 55g | Fiber: 8g",
      "Energy sustainer: almonds (30g): ~170 kcal | P: 6g | F: 15g | Mg: 80mg",
      "Hydration: coconut water (330ml): ~45 kcal | K: 600mg | natural electrolytes"
    ]
  };

  return tips[topic] ?? [
    "Balanced meal target: ~500-600 kcal with 25-30g protein per meal",
    "Daily protein goal: 1.2-1.6g per kg body weight for active adults",
    "Micronutrient priority: Vitamin D, Magnesium, Omega-3, Iron"
  ];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generateFallbackAnalyzer(message: string, wearable: WearableSnapshot, sessionId: string): AnalyzerResult {
  const topics = detectTopics(message);
  const energy = getEnergyFromWearable(wearable);
  const primary = topics[0];
  const template = TOPIC_RESPONSES[primary] ?? TOPIC_RESPONSES.general;

  log({ level: "info", agent: "fallback", message: `Using fallback Analyzer (topics: ${topics.join(", ")}, energy: ${energy})`, sessionId });

  const signals: string[] = [];
  if (wearable.steps < 4000) signals.push("Low step count — may indicate sedentary day");
  if (wearable.steps > 10000) signals.push("Good activity level today");
  const sleepNum = parseFloat(String(wearable.sleepHours));
  if (sleepNum < 6.5) signals.push("Below-average sleep — recovery may be impaired");
  if (sleepNum >= 7.5) signals.push("Solid sleep duration — good recovery foundation");
  if (wearable.stressLevel === "high") signals.push("Elevated stress levels detected");

  const risks: string[] = [];
  if (energy < 30) risks.push("Low energy score — monitor for persistent fatigue patterns");
  if (wearable.stressLevel === "high") risks.push("Chronically high stress — consider professional support if this continues");
  if (topics.includes("pain")) risks.push("If pain persists beyond 3 days, consult a healthcare professional");

  return {
    summary: template.summary,
    energyScore: energy,
    keySignals: signals.length > 0 ? signals : ["Activity and recovery levels appear within normal range"],
    riskFlags: risks.length > 0 ? risks : ["No significant risk flags at this time"]
  };
}

export function generateFallbackPlan(message: string, analyzer: AnalyzerResult): PlanRecommendation {
  const topics = detectTopics(message);
  const primary = topics[0];
  const template = TOPIC_RESPONSES[primary] ?? TOPIC_RESPONSES.general;

  // Adjust exercise intensity based on energy
  let exercise = [...template.exercise];
  if (analyzer.energyScore < 35) {
    exercise = exercise.map(e => e.replace(/30-45 min|30-40 min|30 min/g, "15-20 min"));
    exercise.push("Keep intensity low — your energy reserves need protecting today");
  }

  return {
    summary: template.summary,
    diet: template.diet,
    exercise,
    hydration: template.hydration,
    recovery: template.recovery,
    nutritionContext: getNutritionTipsForTopic(primary)
  };
}

export function generateFallbackMonitor(message: string, analyzer: AnalyzerResult, _plan: PlanRecommendation, userName?: string): MonitorResult {
  const topics = detectTopics(message);
  const primary = topics[0];
  const template = TOPIC_RESPONSES[primary] ?? TOPIC_RESPONSES.general;

  // Personalize reply with user name if available
  let reply = template.reply;
  if (userName) {
    // Insert name naturally after first sentence or greeting
    const firstPeriod = reply.indexOf(". ");
    if (firstPeriod > 0 && firstPeriod < 60) {
      reply = reply.slice(0, firstPeriod + 2) + `${userName}, ` + reply.slice(firstPeriod + 2, firstPeriod + 3).toLowerCase() + reply.slice(firstPeriod + 3);
    }
  }

  return {
    reply,
    tone: analyzer.energyScore > 60 ? "encouraging" : "empathetic",
    feedbackPrompt: template.feedbackPrompt,
    adaptationNote: `Fallback mode — topics: ${topics.join(", ")}. Energy: ${analyzer.energyScore}/100. Revisit with Nova when quota resets.`
  };
}

/**
 * Check if an error is a quota/rate-limit issue that should trigger fallback
 */
export function isQuotaError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("too many tokens") ||
      msg.includes("rate exceeded") ||
      msg.includes("throttling") ||
      msg.includes("quota") ||
      msg.includes("limit exceeded") ||
      msg.includes("servicequotaexceeded") ||
      msg.includes("operation not allowed") ||
      msg.includes("not authorized")
    );
  }
  return false;
}
