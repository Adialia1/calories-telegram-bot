import { internalMutation } from "./_generated/server";

export const deleteOldImages = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days ago
    const oldMeals = await ctx.db
      .query("meals")
      .withIndex("by_logged")
      .order("asc")
      .collect();

    let deleted = 0;
    for (const meal of oldMeals) {
      if (meal.loggedAt > cutoff) break; // sorted asc, so we can stop early
      if (meal.imageStorageId) {
        await ctx.storage.delete(meal.imageStorageId);
        await ctx.db.patch(meal._id, { imageStorageId: undefined });
        deleted++;
      }
    }
    if (deleted > 0) {
      console.log(`Cleaned up ${deleted} old images`);
    }
  },
});
