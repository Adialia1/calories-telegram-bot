import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

// Simple key-value store for the single agent thread ID.
// Since this is a personal bot with one user, we just store one thread.

export const getThreadId = internalQuery({
  args: {},
  handler: async (ctx) => {
    const doc = await ctx.db.query("settings").first();
    return doc?.value ?? null;
  },
});

export const setThreadId = internalMutation({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    const existing = await ctx.db.query("settings").first();
    if (existing) {
      await ctx.db.patch(existing._id, { value: threadId });
    } else {
      await ctx.db.insert("settings", {
        key: "agentThreadId",
        value: threadId,
      });
    }
  },
});
