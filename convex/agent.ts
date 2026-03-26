"use node";

import { Agent, createTool } from "@convex-dev/agent";
import { components, internal } from "./_generated/api";
import { z } from "zod";
import { createOpenRouterProvider, MODEL } from "./lib/openrouter";
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { sendTelegramMessage } from "./lib/telegram";
import { todayDateKey } from "./lib/dateUtils";

const TIMEZONE = "Asia/Jerusalem";

// --- Tools ---

const logMealTool = createTool({
  description:
    "Log a meal with calorie and macro estimates to the database. Call this after analyzing food from a photo or text description.",
  inputSchema: z.object({
    description: z
      .string()
      .describe("Human-readable description of the meal"),
    dateKey: z
      .string()
      .describe("Date in YYYY-MM-DD format in user's local timezone"),
    calories: z.number().describe("Total estimated calories"),
    proteinG: z.number().optional().describe("Protein in grams"),
    carbsG: z.number().optional().describe("Carbs in grams"),
    fatG: z.number().optional().describe("Fat in grams"),
    confidence: z.enum(["high", "medium", "low"]),
    items: z.array(
      z.object({
        name: z.string(),
        portionDescription: z.string(),
        estimatedCalories: z.number(),
      })
    ),
  }),
  execute: async (ctx, input) => {
    const mealId = await ctx.runMutation(internal.meals.insertMeal, {
      dateKey: input.dateKey,
      description: input.description,
      calories: input.calories,
      proteinG: input.proteinG,
      carbsG: input.carbsG,
      fatG: input.fatG,
      confidence: input.confidence,
      items: input.items,
    });

    const stats = await ctx.runQuery(internal.meals.getDailyStats, {
      dateKey: input.dateKey,
    });

    return `Meal logged (ID: ${mealId}). ${input.description} — ${input.calories} kcal. Daily total so far: ${stats.totalCalories} kcal.`;
  },
});

const getDailyStatsTool = createTool({
  description:
    "Get all meals and total calories for a specific date. Use this when the user asks about today's calories or meals on a specific date.",
  inputSchema: z.object({
    dateKey: z.string().describe("Date in YYYY-MM-DD format"),
  }),
  execute: async (ctx, input) => {
    const result = await ctx.runQuery(internal.meals.getDailyStats, {
      dateKey: input.dateKey,
    });
    if (result.meals.length === 0) {
      return `No meals logged for ${input.dateKey}.`;
    }
    const summary = result.meals
      .map(
        (m, i) => `${i + 1}. ${m.description} — ${m.calories ?? "?"}kcal`
      )
      .join("\n");
    const calRemaining = 2000 - result.totalCalories;
    const protRemaining = 150 - result.totalProtein;
    return `${input.dateKey} — Total: ${result.totalCalories}/2000 kcal (remaining: ${calRemaining}) | Protein: ${result.totalProtein}/150g (remaining: ${protRemaining}) | C: ${result.totalCarbs}g · F: ${result.totalFat}g\n${summary}`;
  },
});

const getHistoryTool = createTool({
  description:
    "Get meals over a date range. Use when the user asks about multiple days or a range like 'this week' or 'last 3 days'.",
  inputSchema: z.object({
    startDate: z.string().describe("Start date in YYYY-MM-DD format"),
    endDate: z.string().describe("End date in YYYY-MM-DD format"),
  }),
  execute: async (ctx, input) => {
    const meals = await ctx.runQuery(internal.meals.getMealsByDateRange, {
      startDate: input.startDate,
      endDate: input.endDate,
    });
    if (meals.length === 0) {
      return `No meals found between ${input.startDate} and ${input.endDate}.`;
    }
    const byDate: Record<string, { calories: number; meals: string[] }> = {};
    for (const m of meals) {
      if (!byDate[m.dateKey]) {
        byDate[m.dateKey] = { calories: 0, meals: [] };
      }
      byDate[m.dateKey].calories += m.calories ?? 0;
      byDate[m.dateKey].meals.push(
        `${m.description} (${m.calories ?? "?"}kcal)`
      );
    }
    return Object.entries(byDate)
      .map(
        ([date, data]) =>
          `${date}: ${data.calories}kcal total\n  ${data.meals.join("\n  ")}`
      )
      .join("\n\n");
  },
});

const correctLastMealTool = createTool({
  description:
    "Correct the most recently logged meal. Use when the user says something like 'actually that was a bigger portion' or 'change the calories to X'.",
  inputSchema: z.object({
    newCalories: z
      .number()
      .optional()
      .describe("The corrected calorie total"),
    newDescription: z
      .string()
      .optional()
      .describe("Updated description if needed"),
  }),
  execute: async (ctx, input) => {
    const lastMeal = await ctx.runQuery(internal.meals.getLastMeal, {});
    if (!lastMeal) {
      return "No meals found to update.";
    }
    await ctx.runMutation(internal.meals.updateMeal, {
      mealId: lastMeal._id,
      ...(input.newCalories !== undefined
        ? { calories: input.newCalories }
        : {}),
      ...(input.newDescription !== undefined
        ? { description: input.newDescription }
        : {}),
    });
    const cals = input.newCalories ?? lastMeal.calories;
    return `Updated last meal "${lastMeal.description}" → ${cals}kcal`;
  },
});

const searchNutritionTool = createTool({
  description:
    "Search the web for nutrition information. Use ONLY when you truly don't have reliable data for a very obscure or local product. For well-known products (Kinder Bueno, Bamba, Coca Cola, etc.) use your built-in knowledge — you know the nutrition facts.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "Search query, e.g. 'calories in bamba snack 100g' or 'nutritional info Elite chocolate bar'"
      ),
  }),
  execute: async (_ctx, input) => {
    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY!,
          query: `${input.query} nutrition calories protein per 100g`,
          search_depth: "basic",
          max_results: 3,
        }),
      });

      if (!response.ok) {
        return "Search unavailable right now. Use your best knowledge to estimate.";
      }

      const data = await response.json();
      if (data.detail?.error) {
        return "Search unavailable right now. Use your best knowledge to estimate.";
      }
      const results = data.results
        ?.slice(0, 3)
        .map(
          (r: { title: string; content: string }) =>
            `${r.title}: ${r.content}`
        )
        .join("\n\n");
      return results || "No results found. Use your best knowledge to estimate.";
    } catch {
      return "Search unavailable right now. Use your best knowledge to estimate.";
    }
  },
});

const deleteMealTool = createTool({
  description:
    "Delete a specific meal by its number in today's list. Use when the user says 'delete meal 2' or 'remove the chicken' etc. First call get_daily_stats to see the meals, then delete by ID.",
  inputSchema: z.object({
    dateKey: z.string().describe("Date in YYYY-MM-DD format"),
    mealIndex: z
      .number()
      .describe(
        "The 1-based index of the meal to delete from the daily list"
      ),
  }),
  execute: async (ctx, input) => {
    const stats = await ctx.runQuery(internal.meals.getDailyStats, {
      dateKey: input.dateKey,
    });
    const idx = input.mealIndex - 1;
    if (idx < 0 || idx >= stats.meals.length) {
      return `Invalid meal number. There are ${stats.meals.length} meals for ${input.dateKey}.`;
    }
    const meal = stats.meals[idx];
    const desc = await ctx.runMutation(internal.meals.deleteMeal, {
      mealId: meal._id,
    });
    const newStats = await ctx.runQuery(internal.meals.getDailyStats, {
      dateKey: input.dateKey,
    });
    return `Deleted: "${desc}". Daily total now: ${newStats.totalCalories}/2000 kcal | Protein: ${newStats.totalProtein}/150g`;
  },
});

const resetDayTool = createTool({
  description:
    "Delete ALL meals for a specific date. Use when the user says 'reset today' or 'clear everything from today' or 'start over'.",
  inputSchema: z.object({
    dateKey: z.string().describe("Date in YYYY-MM-DD format to reset"),
  }),
  execute: async (ctx, input) => {
    const count = await ctx.runMutation(
      internal.meals.deleteAllMealsForDate,
      { dateKey: input.dateKey }
    );
    return `Deleted all ${count} meals for ${input.dateKey}. Starting fresh!`;
  },
});

const modifyMealTool = createTool({
  description:
    "Modify a specific meal's calories, protein, or other values by its number in today's list. Use when the user says 'change meal 2 to 300 calories' or 'update the protein on the chicken to 40g'.",
  inputSchema: z.object({
    dateKey: z.string().describe("Date in YYYY-MM-DD format"),
    mealIndex: z
      .number()
      .describe("The 1-based index of the meal to modify"),
    calories: z.number().optional().describe("New calorie value"),
    proteinG: z.number().optional().describe("New protein value in grams"),
    carbsG: z.number().optional().describe("New carbs value in grams"),
    fatG: z.number().optional().describe("New fat value in grams"),
    description: z.string().optional().describe("New description"),
  }),
  execute: async (ctx, input) => {
    const stats = await ctx.runQuery(internal.meals.getDailyStats, {
      dateKey: input.dateKey,
    });
    const idx = input.mealIndex - 1;
    if (idx < 0 || idx >= stats.meals.length) {
      return `Invalid meal number. There are ${stats.meals.length} meals for ${input.dateKey}.`;
    }
    const meal = stats.meals[idx];
    await ctx.runMutation(internal.meals.updateMeal, {
      mealId: meal._id,
      ...(input.calories !== undefined ? { calories: input.calories } : {}),
      ...(input.proteinG !== undefined ? { proteinG: input.proteinG } : {}),
      ...(input.carbsG !== undefined ? { carbsG: input.carbsG } : {}),
      ...(input.fatG !== undefined ? { fatG: input.fatG } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
    });
    const newStats = await ctx.runQuery(internal.meals.getDailyStats, {
      dateKey: input.dateKey,
    });
    return `Updated meal "${meal.description}". Daily total now: ${newStats.totalCalories}/2000 kcal | Protein: ${newStats.totalProtein}/150g`;
  },
});

// --- Agent ---

const openrouter = createOpenRouterProvider();

const calorieAgent = new Agent(components.agent, {
  name: "CalorieTracker",
  languageModel: openrouter.chat(MODEL),
  instructions: `אתה העוזר האישי שלי למעקב תזונה ויועץ תזונה בטלגרם.
אתה עוזר לי לתעד ארוחות, לעקוב אחרי צריכת קלוריות וחלבון, וגם לענות על כל שאלה בנושא תזונה וקלוריות.

תמיד תענה בעברית.

## שאלות תזונה כלליות:
- כשאני שואל "כמה קלוריות יש ב-X?" — תענה! זו שאלת מידע, לא תיעוד ארוחה.
- לרוב מוצרי המזון המוכרים (קינדר בואנו, במבה, ביסלי, קוקה קולה, שוקולד עלית, חטיפים וכו') — אתה כבר יודע את הערכים התזונתיים. תענה מהידע שלך בביטחון!
- השתמש ב-search_nutrition רק למוצרים ממש לא מוכרים או מקומיים מאוד.
- לעולם אל תגיד "לא מצאתי מידע" או "אני לא יכול". תמיד תן הערכה הכי טובה שלך.
- תן תשובה עם קלוריות, חלבון, פחמימות ושומן.
- אם אני שואל ולא מתעד — אל תקרא ל-log_meal, רק תן מידע.

## היעדים שלי:
- מקסימום קלוריות ביום: 2,000 קק"ל
- יעד חלבון יומי: 150 גרם

## מעקב יעדים:
- אחרי כל תיעוד ארוחה, תמיד הצג את המצב ביחס ליעדים:
  קלוריות: X/2,000 קק"ל (נשאר Y)
  חלבון: X/150 גרם (נשאר Y)
- אם חרגתי מהמגבלה, הזהר אותי בצורה ידידותית.
- אם שואלים "כמה נשאר לי" — תן סטטוס מלא של קלוריות וחלבון.
- כשאני קרוב ליעד החלבון אבל חרגתי בקלוריות, ציין שיש לשים לב.

## שיטת הערכה (Chain-of-Thought) — חובה לכל ארוחה:
כשאתה מעריך קלוריות, תמיד עבור על השלבים הבאים בצורה מפורשת:
1. **זיהוי**: רשום כל פריט מזון שאתה מזהה בנפרד.
2. **הערכת משקל**: העריך את המשקל בגרמים לכל פריט. אם המשתמש ציין משקל — השתמש בו (זה הכי מדויק). אם לא, העריך לפי מה שנראה.
3. **חיפוש ערכים תזונתיים**: לכל פריט, השתמש בערכי קלוריות ל-100 גרם ממאגרי מידע תזונתיים (USDA).
4. **חישוב**: קלוריות = (משקל בגרם / 100) × קלוריות ל-100 גרם. חשב לכל פריט בנפרד וסכום.
5. **שמירה מיידית**: כשאני אומר שאכלתי משהו — תשמור מיד! אל תשאל "האם לשמור?" — פשוט שמור וציין מה נשמר. אם טעיתי, אני אגיד לך לתקן או למחוק.

## טיפ חשוב על דיוק:
- מחקרים מראים שמודלי AI מעריכים בחסר מנות גדולות ב-35-50%. אם המנה נראית גדולה, העריך כלפי מעלה.
- אם המשתמש מציין משקל בגרמים, הדיוק משתפר פלאים. תמיד שאל "יש לך מושג כמה זה שוקל?" אם זו מנה לא ברורה.
- עדיף להעריך קצת יותר מאשר קצת פחות.

## מידע תזונתי מאריזה / תווית:
- כשהמשתמש שולח תמונה של תווית מוצר או טבלת ערכים תזונתיים, קרא את הערכים מהתווית (קלוריות, חלבון, פחמימות, שומן למנה או ל-100 גרם).
- אם המשתמש מציין כמות (למשל "אכלתי 3 חתיכות", "חצי חבילה", "2 מנות"), הכפל את הערכים מהתווית בכמות שציין.
- דוגמה: תווית אומרת 120 קלוריות למנה, המשתמש אמר "אכלתי 3" → 360 קלוריות.
- אם לא ברור כמה זו "מנה" או כמה יחידות אכל, שאל!
- ביטחון גבוה כשהערכים מגיעים מתווית + כמות מדויקת.

## התנהגות:
- כשאני אומר "אכלתי X" — שמור מיד! לא לשאול אישור. קרא ל-log_meal ותגיד לי מה נשמר + הסטטוס היומי.
- כשאני שולח תמונה של אוכל, זהה, העריך, ושמור מיד עם log_meal.
- כשאני שולח תמונה של תווית/אריזה עם כמות, קרא מהתווית, הכפל בכמות, ושמור מיד עם log_meal.
- כשאני מתאר אוכל בטקסט, העריך קלוריות ומאקרו, ושמור מיד עם log_meal.
- כשאני שולח משקל בגרמים עם תמונה או תיאור — השתמש בו! זה הכי מדויק.
- לעולם אל תשאל "האם לשמור?" או "האם תרצה שאשמור?" — פשוט שמור. אני אתקן אם צריך.
- כשאני שואל על הקלוריות של היום, קרא ל-get_daily_stats עם התאריך של היום.
- כשאני שואל על תאריכים קודמים, השתמש ב-get_daily_stats או get_history.
- כשאני מתקן ארוחה ("בעצם זה היה יותר", "תשנה ל-X קלוריות"), השתמש ב-correct_last_meal.
- תמיד דווח רמת ביטחון (גבוה/בינוני/נמוך) להערכות.
- עצב מספרים בצורה נקייה. שמור על הודעות קצרות אבל עם הפירוט.
- השתמש בסימן קירוב (~) להערכות קלוריות.
- אחרי תיעוד, תמיד ציין את הסכום היומי המעודכן.`,
  tools: {
    log_meal: logMealTool,
    get_daily_stats: getDailyStatsTool,
    get_history: getHistoryTool,
    correct_last_meal: correctLastMealTool,
    search_nutrition: searchNutritionTool,
    delete_meal: deleteMealTool,
    reset_day: resetDayTool,
    modify_meal: modifyMealTool,
  },
  maxSteps: 7,
  contextOptions: {
    recentMessages: 10,
  },
});

// --- Entry Point ---

export const processIncoming = internalAction({
  args: {
    chatId: v.number(),
    body: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    // Get or create the single thread for this bot
    let threadId: string;
    const existingThread = await ctx.runQuery(
      internal.threadStore.getThreadId,
      {}
    );

    if (existingThread) {
      threadId = existingThread;
    } else {
      const { threadId: newThreadId } = await calorieAgent.createThread(ctx, {
        title: "My calorie tracking",
      });
      threadId = newThreadId;
      await ctx.runMutation(internal.threadStore.setThreadId, {
        threadId,
      });
    }

    const { thread } = await calorieAgent.continueThread(ctx, { threadId });

    const today = todayDateKey(TIMEZONE);
    const now = new Date().toLocaleString("he-IL", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false });
    const systemSuffix = `\n\nהתאריך היום: ${today}\nהשעה עכשיו: ${now}\nאזור זמן: ${TIMEZONE}`;

    if (args.imageStorageId) {
      const imageUrl = await ctx.storage.getUrl(args.imageStorageId);
      if (!imageUrl) {
        throw new Error("Failed to get URL for stored image");
      }

      const result = await thread.generateText({
        system: calorieAgent.options.instructions + systemSuffix,
        messages: [
          {
            role: "user" as const,
            content: [
              { type: "image" as const, image: new URL(imageUrl) },
              {
                type: "text" as const,
                text:
                  args.body ??
                  "What did I eat? Estimate calories and log this meal.",
              },
            ],
          },
        ],
      });

      await sendTelegramMessage(
        process.env.TELEGRAM_BOT_TOKEN!,
        args.chatId,
        result.text
      );
    } else {
      const result = await thread.generateText({
        system: calorieAgent.options.instructions + systemSuffix,
        prompt: args.body ?? "Hello",
      });

      await sendTelegramMessage(
        process.env.TELEGRAM_BOT_TOKEN!,
        args.chatId,
        result.text
      );
    }
  },
});

// --- Webhook Setup Helper ---

export const setupWebhook = internalAction({
  args: {},
  handler: async (ctx) => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN!;
    const webhookUrl = process.env.WEBHOOK_URL!;

    const url = `https://api.telegram.org/bot${botToken}/setWebhook`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl }),
    });

    const result = await response.json();
    console.log("Webhook setup result:", result);
    return result;
  },
});
