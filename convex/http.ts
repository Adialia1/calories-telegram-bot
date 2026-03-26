import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/telegram/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();

    // Telegram sends an Update object
    const message = body.message;
    if (!message) {
      // Could be an edited_message, callback_query, etc. — ignore
      return new Response("OK", { status: 200 });
    }

    const chatId = message.chat.id;

    // Only respond to the bot owner
    const OWNER_CHAT_ID = parseInt(process.env.OWNER_CHAT_ID ?? "0");
    if (chatId !== OWNER_CHAT_ID) {
      return new Response("OK", { status: 200 });
    }

    const text = message.text || message.caption || "";

    // Check for photo
    let imageStorageId: string | undefined;
    if (message.photo && message.photo.length > 0) {
      try {
        // Telegram sends multiple sizes — pick the largest
        const largestPhoto = message.photo[message.photo.length - 1];
        const fileId = largestPhoto.file_id;

        // Get the file URL from Telegram
        const botToken = process.env.TELEGRAM_BOT_TOKEN!;
        const getFileUrl = `https://api.telegram.org/bot${botToken}/getFile`;
        const fileResponse = await fetch(getFileUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file_id: fileId }),
        });

        if (fileResponse.ok) {
          const fileData = await fileResponse.json();
          const filePath = fileData.result.file_path;
          const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

          // Download and store in Convex
          const imageResponse = await fetch(downloadUrl);
          if (imageResponse.ok) {
            const blob = await imageResponse.blob();
            imageStorageId = await ctx.storage.store(blob);
          }
        }
      } catch (err) {
        console.error("Error downloading Telegram photo:", err);
      }
    }

    // Schedule agent processing asynchronously
    await ctx.runMutation(internal.scheduling.scheduleAgentProcessing, {
      chatId,
      body: text || undefined,
      imageStorageId: imageStorageId as any,
    });

    return new Response("OK", { status: 200 });
  }),
});

export default http;
