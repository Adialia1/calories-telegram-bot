import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  meals: defineTable({
    loggedAt: v.number(),
    dateKey: v.string(), // "2026-03-26" in your timezone
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
  })
    .index("by_date", ["dateKey"])
    .index("by_logged", ["loggedAt"]),

  settings: defineTable({
    key: v.string(),
    value: v.string(),
  }).index("by_key", ["key"]),
});
