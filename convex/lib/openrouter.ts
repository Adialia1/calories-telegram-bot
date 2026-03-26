"use node";

import { createOpenAI } from "@ai-sdk/openai";

export function createOpenRouterProvider() {
  return createOpenAI({
    apiKey: process.env.OPENROUTER_API_KEY!,
    baseURL: "https://openrouter.ai/api/v1",
    headers: {
      "HTTP-Referer": "https://calorie-bot.convex.site",
      "X-Title": "Calorie Tracking Bot",
    },
  });
}

export const MODEL = "google/gemini-2.0-flash-001";
