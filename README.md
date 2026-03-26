# Calorie Tracker Telegram Bot

A personal AI-powered calorie and protein tracking bot for Telegram. Send food photos or text descriptions, and the bot identifies what you ate, estimates calories and macros, and tracks your daily intake — all in Hebrew.

Built with **Convex** (serverless backend), **Vercel AI SDK** + **OpenRouter** (LLM), and the **Telegram Bot API**.

## Features

- **Photo Analysis** — Send a food photo and get instant calorie/macro estimates using vision AI
- **Text Logging** — Describe what you ate ("אכלתי שניצל עם אורז") and it logs automatically
- **Nutrition Label Reading** — Send a photo of a product label + quantity ("אכלתי 3 חתיכות") and it calculates
- **Daily Goals Tracking** — Tracks calories (2,000 kcal) and protein (150g) with remaining balance after each meal
- **Smart Estimation** — Uses chain-of-thought reasoning: identify → estimate weight → lookup per 100g → calculate
- **Web Search Fallback** — Searches the web (via Tavily) for obscure products it doesn't recognize
- **Full CRUD** — Modify, delete specific meals, or reset the entire day
- **Hebrew Interface** — Fully localized in Hebrew
- **Conversation Memory** — Remembers context via persistent threads (`@convex-dev/agent`)
- **Single-User Lock** — Only responds to the configured owner

## Architecture

```
Telegram → Convex HTTP Action → Scheduler → AI Agent → Telegram Reply
                                    ↓
                              Convex Database
```

- **Convex HTTP Action** receives the Telegram webhook, downloads photos to Convex storage, and schedules processing
- **AI Agent** (`@convex-dev/agent` + Vercel AI SDK v6) processes the message with tool calling
- **OpenRouter** (Gemini 2.0 Flash) provides the multimodal LLM for vision + text
- **8 Agent Tools**: `log_meal`, `get_daily_stats`, `get_history`, `correct_last_meal`, `delete_meal`, `modify_meal`, `reset_day`, `search_nutrition`
- **Convex Database** stores meals with full macro breakdown, indexed by date

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | [Convex](https://convex.dev) — serverless functions, database, file storage, cron jobs |
| AI Agent | [@convex-dev/agent](https://www.npmjs.com/package/@convex-dev/agent) — persistent threads, tool calling, memory |
| LLM | [OpenRouter](https://openrouter.ai) → Gemini 2.0 Flash (multimodal) via [Vercel AI SDK v6](https://sdk.vercel.ai) |
| Messaging | [Telegram Bot API](https://core.telegram.org/bots/api) |
| Web Search | [Tavily](https://tavily.com) (for unknown products) |

## Project Structure

```
convex/
├── convex.config.ts      # Component registration (@convex-dev/agent)
├── schema.ts             # Database schema (meals + settings tables)
├── http.ts               # Telegram webhook endpoint
├── agent.ts              # AI agent definition, tools, and entry point
├── meals.ts              # CRUD mutations/queries for meals
├── threadStore.ts        # Persists the single agent thread ID
├── scheduling.ts         # Async bridge: HTTP action → scheduler → agent
├── storage.ts            # Cron job to clean up old images
├── crons.ts              # Scheduled jobs
└── lib/
    ├── telegram.ts       # Send messages via Telegram Bot API
    ├── openrouter.ts     # AI SDK provider configured for OpenRouter
    └── dateUtils.ts      # Timezone-aware date helpers
```

## Setup

### Prerequisites

- [Node.js](https://nodejs.org) 18+
- A [Convex](https://convex.dev) account
- A Telegram bot token (from [@BotFather](https://t.me/BotFather))
- An [OpenRouter](https://openrouter.ai) API key
- (Optional) A [Tavily](https://tavily.com) API key for web search

### Installation

```bash
git clone https://github.com/YOUR_USERNAME/calories-telegram-bot.git
cd calories-telegram-bot
npm install
npx convex dev
```

### Environment Variables

Set these in the Convex dashboard (Settings → Environment Variables):

| Variable | Description |
|----------|------------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `OPENROUTER_API_KEY` | OpenRouter API key |
| `OWNER_CHAT_ID` | Your Telegram chat ID (send a message to the bot, check logs) |
| `WEBHOOK_URL` | `https://<deployment>.convex.site/telegram/webhook` |
| `TAVILY_API_KEY` | (Optional) Tavily API key for web search |

### Register the Webhook

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://<deployment>.convex.site/telegram/webhook"}'
```

### Customize

- **Timezone**: Change `TIMEZONE` in `convex/agent.ts` (default: `Asia/Jerusalem`)
- **Goals**: Change calorie/protein targets in the agent instructions in `convex/agent.ts`
- **Language**: Modify the Hebrew instructions in the agent prompt

## Accuracy Approach

Based on [peer-reviewed research](https://www.sciencedirect.com/science/article/pii/S2475299125030185), the bot uses several techniques to improve calorie estimation accuracy:

1. **Chain-of-Thought Prompting** — Forces step-by-step reasoning (identify → weigh → lookup → calculate)
2. **Weight-First** — If you provide weight in grams, accuracy improves dramatically
3. **Large Portion Bias Correction** — AI models underestimate large portions by 35-50%; the prompt compensates
4. **Conservative Estimation** — Estimates lean slightly high rather than low
5. **Web Search** — Looks up specific products when built-in knowledge is insufficient

## Example Conversations

```
You: אכלתי שניצל עם אורז
Bot: נשמר!
     שניצל עוף (~200 גרם) → ~400 קק"ל, 40 גרם חלבון
     אורז (~150 גרם) → ~195 קק"ל, 4 גרם חלבון
     סה"כ: ~595 קק"ל | חלבון: 44 גרם
     קלוריות: 595/2,000 (נשאר 1,405)
     חלבון: 44/150 גרם (נשאר 106)

You: כמה קלוריות יש בבמבה?
Bot: במבה (שקית 80 גרם) מכילה ~460 קק"ל, 8 גרם חלבון, 25 גרם שומן, 52 גרם פחמימות.

You: תמחק את הארוחה האחרונה
Bot: נמחק: "שניצל עם אורז". סה"כ היום: 0/2,000 קק"ל
```

## Cost

| Service | Monthly Cost |
|---------|-------------|
| Convex (Starter) | Free |
| OpenRouter (Gemini Flash) | ~$1-2 |
| Telegram Bot API | Free |
| Tavily (optional) | Free tier |
| **Total** | **~$1-2/month** |

## License

MIT
