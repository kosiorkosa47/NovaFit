/**
 * Harmful / concerning ingredient knowledge base.
 * Used by the Nutrition Facts scanner to warn users about potentially
 * dangerous additives in processed food.
 */

export type RiskLevel = "high" | "moderate" | "low";

export interface IngredientWarning {
  /** Canonical name (English) */
  name: string;
  /** Alternative names / E-numbers the ingredient may appear as */
  aliases: string[];
  /** Risk severity */
  risk: RiskLevel;
  /** Short explanation of why it's harmful */
  reason: string;
  /** Health effects */
  effects: string[];
  /** Common products where it's found */
  foundIn: string[];
}

export const HARMFUL_INGREDIENTS: IngredientWarning[] = [
  // ── HIGH RISK ──
  {
    name: "Phosphoric Acid",
    aliases: ["phosphoric acid", "e338", "kwas fosforowy", "acido fosforico"],
    risk: "high",
    reason: "Leaches calcium from bones, damages tooth enamel, disrupts kidney function",
    effects: ["Osteoporosis", "Tooth decay", "Kidney damage", "Calcium deficiency"],
    foundIn: ["Coca-Cola", "Pepsi", "Most dark sodas"],
  },
  {
    name: "High-Fructose Corn Syrup",
    aliases: [
      "high fructose corn syrup", "hfcs", "glucose-fructose syrup",
      "syrop glukozowo-fruktozowy", "isoglucose", "corn sugar",
      "glucose-fructose", "fructose-glucose syrup",
    ],
    risk: "high",
    reason: "Drives insulin resistance, fatty liver disease, and obesity faster than regular sugar",
    effects: ["Obesity", "Type 2 diabetes", "Fatty liver", "Metabolic syndrome"],
    foundIn: ["Sodas", "Candy", "Processed bread", "Ketchup", "Yogurt drinks"],
  },
  {
    name: "Partially Hydrogenated Oils (Trans Fats)",
    aliases: [
      "partially hydrogenated", "trans fat", "trans fats",
      "tluszcze trans", "margarine", "shortening",
      "partially hydrogenated soybean oil", "partially hydrogenated vegetable oil",
    ],
    risk: "high",
    reason: "Raises LDL cholesterol, lowers HDL, increases heart disease and stroke risk",
    effects: ["Heart disease", "Stroke", "Inflammation", "Insulin resistance"],
    foundIn: ["Margarine", "Fried foods", "Baked goods", "Microwave popcorn"],
  },
  {
    name: "Sodium Nitrite / Nitrate",
    aliases: [
      "sodium nitrite", "sodium nitrate", "e250", "e251",
      "potassium nitrite", "potassium nitrate", "e249", "e252",
      "azotyn sodu", "azotan sodu",
    ],
    risk: "high",
    reason: "Forms carcinogenic nitrosamines during cooking and digestion",
    effects: ["Colorectal cancer risk", "Stomach cancer risk", "DNA damage"],
    foundIn: ["Hot dogs", "Bacon", "Deli meats", "Sausages", "Cured meats"],
  },
  {
    name: "Butylated Hydroxyanisole (BHA)",
    aliases: ["bha", "e320", "butylated hydroxyanisole"],
    risk: "high",
    reason: "Classified as reasonably anticipated to be a human carcinogen (NTP)",
    effects: ["Cancer risk", "Endocrine disruption", "Allergic reactions"],
    foundIn: ["Chips", "Preserved meats", "Butter", "Cereals"],
  },

  // ── MODERATE RISK ──
  {
    name: "Aspartame",
    aliases: ["aspartame", "e951", "nutrasweet", "equal", "aspartam"],
    risk: "moderate",
    reason: "WHO classified as possibly carcinogenic (Group 2B); may trigger headaches",
    effects: ["Possible carcinogen", "Headaches", "Gut microbiome disruption"],
    foundIn: ["Diet sodas", "Sugar-free gum", "Light yogurt", "Zero drinks"],
  },
  {
    name: "Sodium Benzoate",
    aliases: ["sodium benzoate", "e211", "benzoesan sodu"],
    risk: "moderate",
    reason: "Reacts with vitamin C (ascorbic acid) to form benzene, a known carcinogen",
    effects: ["Benzene formation", "Hyperactivity in children", "Cell damage"],
    foundIn: ["Soft drinks", "Fruit juices", "Pickles", "Salad dressings"],
  },
  {
    name: "Tartrazine (Yellow 5)",
    aliases: ["tartrazine", "e102", "yellow 5", "fd&c yellow 5", "yellow no. 5"],
    risk: "moderate",
    reason: "Linked to allergic reactions, asthma attacks, and hyperactivity in children",
    effects: ["Allergic reactions", "Asthma", "Hyperactivity", "Urticaria"],
    foundIn: ["Candy", "Soft drinks", "Instant soups", "Cereals", "Cheese snacks"],
  },
  {
    name: "Red 40 (Allura Red)",
    aliases: ["red 40", "allura red", "e129", "fd&c red 40", "red no. 40"],
    risk: "moderate",
    reason: "Associated with behavioral issues in children; may contain carcinogenic contaminants",
    effects: ["Hyperactivity", "Behavioral issues", "Allergic reactions"],
    foundIn: ["Candy", "Sodas", "Cereals", "Snack cakes"],
  },
  {
    name: "Carrageenan",
    aliases: ["carrageenan", "e407", "karagena"],
    risk: "moderate",
    reason: "Triggers inflammatory response in the gut; linked to GI issues",
    effects: ["Gut inflammation", "Bloating", "IBS symptoms"],
    foundIn: ["Plant milks", "Ice cream", "Deli meats", "Yogurt"],
  },
  {
    name: "Monosodium Glutamate (MSG)",
    aliases: ["msg", "monosodium glutamate", "e621", "glutaminian sodu"],
    risk: "moderate",
    reason: "Can cause headaches and flushing in sensitive individuals; may drive overeating",
    effects: ["Headaches", "Flushing", "Overeating", "Numbness"],
    foundIn: ["Instant noodles", "Chips", "Fast food", "Canned soups"],
  },
  {
    name: "Potassium Bromate",
    aliases: ["potassium bromate", "e924", "bromian potasu"],
    risk: "high",
    reason: "Classified as possibly carcinogenic (IARC Group 2B); banned in EU, UK, Canada, Brazil",
    effects: ["Kidney damage", "Cancer risk", "Thyroid disruption"],
    foundIn: ["Commercial bread", "Baked goods"],
  },

  // ── LOW RISK (but worth noting) ──
  {
    name: "Artificial Caramel Color",
    aliases: ["caramel color", "e150d", "4-mei", "caramel colour"],
    risk: "low",
    reason: "E150d variant contains 4-MEI, a possible carcinogen at high doses",
    effects: ["Possible carcinogen (4-MEI)", "Allergic reactions"],
    foundIn: ["Cola drinks", "Soy sauce", "Dark beers", "Brown bread"],
  },
  {
    name: "Sucralose",
    aliases: ["sucralose", "e955", "splenda", "sukraloza"],
    risk: "low",
    reason: "May alter gut microbiome and glucose/insulin response",
    effects: ["Gut microbiome changes", "Insulin response changes"],
    foundIn: ["Sugar-free products", "Protein bars", "Diet drinks"],
  },
  {
    name: "Acesulfame Potassium",
    aliases: ["acesulfame k", "acesulfame potassium", "e950", "ace-k"],
    risk: "low",
    reason: "Limited studies suggest possible effects on gut bacteria and metabolism",
    effects: ["Gut microbiome changes", "Possible metabolic effects"],
    foundIn: ["Sugar-free drinks", "Protein shakes", "Chewing gum"],
  },
];

/**
 * Scan an ingredients text and return all matched warnings.
 */
export function analyzeIngredients(ingredientsText: string): IngredientWarning[] {
  const lower = ingredientsText.toLowerCase();
  const found: IngredientWarning[] = [];

  for (const ingredient of HARMFUL_INGREDIENTS) {
    const matched = ingredient.aliases.some((alias) => lower.includes(alias));
    if (matched && !found.includes(ingredient)) {
      found.push(ingredient);
    }
  }

  // Sort by risk: high first
  const riskOrder: Record<RiskLevel, number> = { high: 0, moderate: 1, low: 2 };
  found.sort((a, b) => riskOrder[a.risk] - riskOrder[b.risk]);

  return found;
}

/**
 * Parse basic nutrition facts from text (OCR output or manual input).
 * Returns structured data if parseable, null otherwise.
 */
export interface NutritionFacts {
  servingSize?: string;
  calories?: number;
  totalFat?: string;
  saturatedFat?: string;
  transFat?: string;
  cholesterol?: string;
  sodium?: string;
  totalCarbs?: string;
  dietaryFiber?: string;
  totalSugars?: string;
  addedSugars?: string;
  protein?: string;
}

export function parseNutritionFacts(text: string): NutritionFacts {
  const facts: NutritionFacts = {};
  const lines = text.toLowerCase();

  // Serving size
  const serving = lines.match(/serving size[:\s]*([^\n]+)/i);
  if (serving) facts.servingSize = serving[1].trim();

  // Calories
  const cal = lines.match(/calories[:\s]*(\d+)/i);
  if (cal) facts.calories = parseInt(cal[1], 10);

  // Macros — try "Xg" or "X g" or "X mg" patterns
  const extract = (pattern: RegExp): string | undefined => {
    const m = lines.match(pattern);
    return m ? m[1].trim() : undefined;
  };

  facts.totalFat = extract(/total fat[:\s]*([\d.]+\s*g)/i);
  facts.saturatedFat = extract(/saturated fat[:\s]*([\d.]+\s*g)/i);
  facts.transFat = extract(/trans fat[:\s]*([\d.]+\s*g)/i);
  facts.cholesterol = extract(/cholesterol[:\s]*([\d.]+\s*mg)/i);
  facts.sodium = extract(/sodium[:\s]*([\d.]+\s*mg)/i);
  facts.totalCarbs = extract(/total carb(?:ohydrate)?s?[:\s]*([\d.]+\s*g)/i);
  facts.dietaryFiber = extract(/dietary fiber[:\s]*([\d.]+\s*g)/i);
  facts.totalSugars = extract(/total sugars?[:\s]*([\d.]+\s*g)/i);
  facts.addedSugars = extract(/added sugars?[:\s]*([\d.]+\s*g)/i);
  facts.protein = extract(/protein[:\s]*([\d.]+\s*g)/i);

  return facts;
}
