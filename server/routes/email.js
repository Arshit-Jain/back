// server/routes/email.js
import express from "express";
import { userQueries, chatQueries, messageQueries } from "../database/queries.js";
import { GeminiService } from "../services/gemini.js";
import { sendCombinedResearchReportSendGrid } from "../services/emailService.js";

const router = express.Router();

// ===== Send research report email =====
router.post("/:chatId/send-email", async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.id;

    // Verify chat ownership
    const chat = await chatQueries.findById(chatId);
    if (!chat || chat.user_id !== userId) {
      return res.status(404).json({ success: false, error: "Chat not found" });
    }

    // Get user email
    const user = await userQueries.findById(userId);
    if (!user || !user.email) {
      return res.status(400).json({ success: false, error: "User email not found" });
    }

    // Get chat messages
    // [handler function start]
    // Get chat messages
    const messages = await messageQueries.findByChatId(chatId);
    if (!messages || messages.length < 3) { // We need at least 1 user message and 2 AI messages
      return res.status(400).json({ success: false, error: "Not enough messages found in chat to generate a report." });
    }

    // --- REFACTORED LOGIC START ---

    // 1. Extract only AI-generated messages
    const aiMessages = messages.filter((m) => !m.is_user);

    // 2. Validate that we have at least two AI messages to work with
    if (aiMessages.length < 2) {
      return res.status(400).json({
        success: false,
        error: "Chat does not contain the required OpenAI and Gemini reports.",
      });
    }

    // 3. Get original topic from the first user message
    // Using .find() is slightly more efficient than .filter().shift()
    const originalTopic = messages.find((m) => m.is_user)?.content || "Research Topic";

    // 4. Assign reports based on their position
    // The last message is assumed to be from Gemini.
    const geminiMsg = aiMessages[aiMessages.length - 1];
    // The second-to-last message is assumed to be from OpenAI.
    const openaiMsg = aiMessages[aiMessages.length - 2];

    const chatgptContent = openaiMsg.content;
    const geminiContent = geminiMsg.content;

    // Send email
    const result = await sendCombinedResearchReportSendGrid(
      user.email,
      chatgptContent,
      geminiContent || "## Gemini (Google) Research\n\nNo Gemini content available.",
      originalTopic
    );

    res.json({
      success: true,
      message: "Research report sent successfully",
      messageId: result.messageId,
      summary: result.summary,
    });
  } catch (error) {
    console.error("Email endpoint error:", error);
    res.status(500).json({ success: false, error: "Failed to send research report", details: error.message });
  }
});

// ===== Get chat count and limits =====
router.get("/user/chat-count", async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await userQueries.findById(userId);

    if (!user) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const { dailyChatQueries } = await import("../database/queries.js");
    const todayCount = await dailyChatQueries.getTodayCount(userId);
    const maxChats = user.is_premium ? 20 : 5;

    res.json({
      success: true,
      todayCount,
      maxChats,
      isPremium: user.is_premium,
    });
  } catch (error) {
    console.error("Get chat count error:", error);
    res.status(500).json({ success: false, error: "Failed to get chat count" });
  }
});

export default router;