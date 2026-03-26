import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

export const scheduleAgentProcessing = internalMutation({
  args: {
    chatId: v.number(),
    body: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, internal.agent.processIncoming, {
      chatId: args.chatId,
      body: args.body,
      imageStorageId: args.imageStorageId,
    });
  },
});
