import { sanitizeMessageInput } from "@/lib/utils/sanitize";
import { log } from "@/lib/utils/logging";

// ---------------------------------------------------------------------------
// Nutritionix API (primary — needs paid keys)
// ---------------------------------------------------------------------------

const NUTRITIONIX_URL = "https://trackapi.nutritionix.com/v2/natural/nutrients";

// ---------------------------------------------------------------------------
// USDA FoodData Central API (free fallback — DEMO_KEY or user key)
// ---------------------------------------------------------------------------

const USDA_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";

const TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NutritionItem {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  servingQty: number;
  servingUnit: string;
}

export interface NutritionData {
  items: NutritionItem[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  summary: string[];
  source: "nutritionix" | "usda" | "fallback";
}

// ---------------------------------------------------------------------------
// Nutritionix API
// ---------------------------------------------------------------------------

interface NutritionixFood {
  food_name?: string;
  nf_calories?: number;
  nf_protein?: number;
  nf_total_carbohydrate?: number;
  nf_total_fat?: number;
  nf_dietary_fiber?: number;
  serving_qty?: number;
  serving_unit?: string;
}

async function fetchNutritionix(message: string): Promise<NutritionData | null> {
  const appId = process.env.NUTRITIONIX_APP_ID;
  const appKey = process.env.NUTRITIONIX_APP_KEY;
  if (!appId || !appKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(NUTRITIONIX_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-app-id": appId,
        "x-app-key": appKey
      },
      body: JSON.stringify({ query: sanitizeMessageInput(message) }),
      signal: controller.signal
    });
    if (!response.ok) return null;

    const data = (await response.json()) as { foods?: NutritionixFood[] };
    if (!data.foods?.length) return null;

    return buildNutritionData(
      data.foods.slice(0, 5).map((f) => ({
        name: f.food_name ?? "Unknown food",
        calories: Math.round(f.nf_calories ?? 0),
        protein: Math.round(f.nf_protein ?? 0),
        carbs: Math.round(f.nf_total_carbohydrate ?? 0),
        fat: Math.round(f.nf_total_fat ?? 0),
        fiber: Math.round(f.nf_dietary_fiber ?? 0),
        servingQty: f.serving_qty ?? 1,
        servingUnit: f.serving_unit ?? "serving"
      })),
      "nutritionix"
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// USDA FoodData Central API (free)
// ---------------------------------------------------------------------------

interface UsdaNutrient {
  nutrientId?: number;
  nutrientName?: string;
  value?: number;
  unitName?: string;
}

interface UsdaFood {
  description?: string;
  foodNutrients?: UsdaNutrient[];
  servingSize?: number;
  servingSizeUnit?: string;
}

function extractUsdaNutrient(nutrients: UsdaNutrient[], id: number): number {
  const n = nutrients.find((n) => n.nutrientId === id);
  return Math.round(n?.value ?? 0);
}

// USDA nutrient IDs: 1008=Energy(kcal), 1003=Protein, 1005=Carbs, 1004=Fat, 1079=Fiber
const NUTRIENT_IDS = { energy: 1008, protein: 1003, carbs: 1005, fat: 1004, fiber: 1079 };

async function fetchUsda(message: string): Promise<NutritionData | null> {
  const apiKey = process.env.USDA_API_KEY || "DEMO_KEY";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  // Extract food-related keywords from the message
  const query = extractFoodQuery(message);
  if (!query) return null;

  try {
    const url = `${USDA_SEARCH_URL}?api_key=${apiKey}&query=${encodeURIComponent(query)}&pageSize=3&dataType=${encodeURIComponent("Survey (FNDDS)")}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;

    const data = (await response.json()) as { foods?: UsdaFood[] };
    if (!data.foods?.length) return null;

    return buildNutritionData(
      data.foods.slice(0, 3).map((f) => ({
        name: f.description ?? "Food item",
        calories: extractUsdaNutrient(f.foodNutrients ?? [], NUTRIENT_IDS.energy),
        protein: extractUsdaNutrient(f.foodNutrients ?? [], NUTRIENT_IDS.protein),
        carbs: extractUsdaNutrient(f.foodNutrients ?? [], NUTRIENT_IDS.carbs),
        fat: extractUsdaNutrient(f.foodNutrients ?? [], NUTRIENT_IDS.fat),
        fiber: extractUsdaNutrient(f.foodNutrients ?? [], NUTRIENT_IDS.fiber),
        servingQty: f.servingSize ? Math.round(f.servingSize) : 100,
        servingUnit: f.servingSizeUnit ?? "g"
      })),
      "usda"
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Common food terms in English and Polish to detect food-related messages
// Match food-related words — Polish forms use prefix matching (no trailing \b) to handle inflections
const FOOD_KEYWORDS = /\b(eat|ate|eaten|food|meal|breakfast|lunch|dinner|snack|chicken|salmon|rice|pasta|salad|egg|bread|pizza|burger|sandwich|fruit|yogurt|milk|cheese|oats|banana|apple|coffee|tea|water|juice|protein|calories|kcal)|(?:jedzeni|jedz|jadl|jad[łl]|sniadani|śniadani|obiad|kolacj|posiłe|posilek|kurczak|ryż|ryz|makaron|jajk|chleb|owoc|mleko|ser|banan|jabłk|jablk|kaw[aeę]|herbat|ziemniak|warzy|zup|salat|jogurt|pierogi|kotlet|schabow)/i;

// Polish → English food translations for USDA API queries
const PL_TO_EN: Record<string, string> = {
  kurczak: "chicken", kurczaka: "chicken", ryz: "rice", ryż: "rice", ryzem: "rice",
  makaron: "pasta", jajko: "egg", jajka: "eggs", chleb: "bread", ziemniak: "potato",
  ziemniaki: "potatoes", warzywa: "vegetables", zupa: "soup", salatka: "salad", salata: "salad",
  jogurt: "yogurt", mleko: "milk", ser: "cheese", banan: "banana", jablko: "apple", jabłko: "apple",
  owoc: "fruit", owoce: "fruits", kawa: "coffee", herbata: "tea", woda: "water",
  pierogi: "dumplings", kotlet: "cutlet", schabowy: "pork cutlet", schabow: "pork cutlet",
  losos: "salmon", łosoś: "salmon", ryba: "fish", wolowina: "beef", wieprzowina: "pork",
  indyk: "turkey", tofu: "tofu", orzechy: "nuts", migdaly: "almonds", maslo: "butter",
  oliwa: "olive oil", pomidor: "tomato", ogorek: "cucumber", marchew: "carrot",
  brokuł: "broccoli", brokul: "broccoli", szpinak: "spinach", szynka: "ham",
  sniadanie: "breakfast", śniadanie: "breakfast", obiad: "lunch", kolacja: "dinner",
  owsianka: "oatmeal", platki: "oats", musli: "muesli", kanapka: "sandwich", pizza: "pizza",
  hamburger: "hamburger", frytki: "fries", sok: "juice", smoothie: "smoothie"
};

function extractFoodQuery(message: string): string | null {
  if (!FOOD_KEYWORDS.test(message)) return null;

  const clean = sanitizeMessageInput(message).toLowerCase();
  const words = clean.split(/\s+/);

  // Translate Polish food words to English for USDA
  const translated = words.map((w) => {
    const stripped = w.replace(/[^a-ząćęłńóśźżA-ZĄĆĘŁŃÓŚŹŻ]/g, "");
    for (const [pl, en] of Object.entries(PL_TO_EN)) {
      if (stripped.startsWith(pl) || stripped === pl) return en;
    }
    return w;
  });

  // Only include food-relevant words
  const foodWords = translated.filter((w) =>
    /^[a-z]{3,}$/i.test(w) && !/^(czuje|sie|zmeczony|malo|spalem|duzo|bardzo|jestem|mam|dzisiaj|wczoraj|jadl|jadle|jedz)$/i.test(w)
  );

  if (foodWords.length === 0) {
    log({ level: "trace", agent: "nutritionix", message: `No food words extracted from: "${clean}"` });
    return null;
  }
  const query = foodWords.join(" ").slice(0, 100);
  log({ level: "info", agent: "nutritionix", message: `Food query: "${query}" (from: "${clean.slice(0, 60)}")` });
  return query;
}

function buildNutritionData(items: NutritionItem[], source: "nutritionix" | "usda"): NutritionData {
  const totalCalories = items.reduce((s, i) => s + i.calories, 0);
  const totalProtein = items.reduce((s, i) => s + i.protein, 0);
  const totalCarbs = items.reduce((s, i) => s + i.carbs, 0);
  const totalFat = items.reduce((s, i) => s + i.fat, 0);

  const summary = items.map(
    (i) => `${i.name} (${i.servingQty}${i.servingUnit}): ${i.calories} kcal | P: ${i.protein}g | C: ${i.carbs}g | F: ${i.fat}g`
  );
  if (items.length > 1) {
    summary.push(`Total: ${totalCalories} kcal | Protein: ${totalProtein}g | Carbs: ${totalCarbs}g | Fat: ${totalFat}g`);
  }

  return { items, totalCalories, totalProtein, totalCarbs, totalFat, summary, source };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getNutritionContext(message: string): Promise<string[]> {
  // 1. Try Nutritionix (paid)
  if (process.env.USE_REAL_NUTRITIONIX === "true") {
    log({ level: "trace", agent: "nutritionix", message: "Querying Nutritionix API..." });
    const data = await fetchNutritionix(message);
    if (data?.summary.length) {
      log({ level: "info", agent: "nutritionix", message: `Nutritionix: ${data.items.length} items, ${data.totalCalories} kcal` });
      return data.summary;
    }
  }

  // 2. Try USDA FoodData Central (free)
  log({ level: "trace", agent: "nutritionix", message: "Trying USDA FoodData Central..." });
  const usdaData = await fetchUsda(message);
  if (usdaData?.summary.length) {
    log({ level: "info", agent: "nutritionix", message: `USDA: ${usdaData.items.length} items, ${usdaData.totalCalories} kcal` });
    return usdaData.summary;
  }

  // 3. Fallback tips
  return [
    "Focus on balanced meals with protein + fiber in each meal.",
    "Prefer low-glycemic snacks in late afternoon to reduce energy crash.",
    "Hydration target: 2-2.5L water daily unless medically restricted."
  ];
}
