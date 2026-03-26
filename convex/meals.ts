import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const insertMeal = internalMutation({
  args: {
    dateKey: v.string(),
    description: v.string(),
    calories: v.optional(v.number()),
    proteinG: v.optional(v.number()),
    carbsG: v.optional(v.number()),
    fatG: v.optional(v.number()),
    imageStorageId: v.optional(v.id("_storage")),
    confidence: v.union(
      v.literal("high"),
      v.literal("medium"),
      v.literal("low")
    ),
    rawLlmResponse: v.optional(v.string()),
    items: v.array(
      v.object({
        name: v.string(),
        portionDescription: v.string(),
        estimatedCalories: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("meals", {
      ...args,
      loggedAt: Date.now(),
    });
  },
});

export const getDailyStats = internalQuery({
  args: {
    dateKey: v.string(),
  },
  handler: async (ctx, { dateKey }) => {
    const meals = await ctx.db
      .query("meals")
      .withIndex("by_date", (q) => q.eq("dateKey", dateKey))
      .order("asc")
      .collect();

    const totalCalories = meals.reduce(
      (sum, m) => sum + (m.calories ?? 0),
      0
    );
    const totalProtein = meals.reduce(
      (sum, m) => sum + (m.proteinG ?? 0),
      0
    );
    const totalCarbs = meals.reduce((sum, m) => sum + (m.carbsG ?? 0), 0);
    const totalFat = meals.reduce((sum, m) => sum + (m.fatG ?? 0), 0);

    return { meals, totalCalories, totalProtein, totalCarbs, totalFat };
  },
});

export const getLastMeal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("meals")
      .withIndex("by_logged")
      .order("desc")
      .first();
  },
});

export const updateMeal = internalMutation({
  args: {
    mealId: v.id("meals"),
    calories: v.optional(v.number()),
    proteinG: v.optional(v.number()),
    carbsG: v.optional(v.number()),
    fatG: v.optional(v.number()),
    description: v.optional(v.string()),
    items: v.optional(
      v.array(
        v.object({
          name: v.string(),
          portionDescription: v.string(),
          estimatedCalories: v.number(),
        })
      )
    ),
  },
  handler: async (ctx, { mealId, ...updates }) => {
    // Filter out undefined values
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        patch[key] = value;
      }
    }
    await ctx.db.patch(mealId, patch);
    return mealId;
  },
});

export const deleteMeal = internalMutation({
  args: { mealId: v.id("meals") },
  handler: async (ctx, { mealId }) => {
    const meal = await ctx.db.get(mealId);
    if (!meal) throw new Error("Meal not found");
    await ctx.db.delete(mealId);
    return meal.description;
  },
});

export const deleteAllMealsForDate = internalMutation({
  args: { dateKey: v.string() },
  handler: async (ctx, { dateKey }) => {
    const meals = await ctx.db
      .query("meals")
      .withIndex("by_date", (q) => q.eq("dateKey", dateKey))
      .collect();

    for (const meal of meals) {
      await ctx.db.delete(meal._id);
    }
    return meals.length;
  },
});

export const getMealsByDateRange = internalQuery({
  args: {
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, { startDate, endDate }) => {
    const meals = await ctx.db
      .query("meals")
      .withIndex("by_date", (q) =>
        q.gte("dateKey", startDate).lte("dateKey", endDate)
      )
      .order("asc")
      .collect();

    return meals;
  },
});
