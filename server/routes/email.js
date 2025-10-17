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
    const messages = await messageQueries.findByChatId(chatId);
    if (!messages || messages.length === 0) {
      return res.status(400).json({ success: false, error: "No messages found in chat" });
    }

    // Extract research content
    const aiMessages = messages.filter((m) => !m.is_user);
    const openaiMsg =
      aiMessages.find((m) => (m.content || "").startsWith("## ChatGPT (OpenAI) Research")) || aiMessages[0];
    const geminiMsg = aiMessages.find((m) => (m.content || "").startsWith("## Gemini (Google) Research")) || null;

    if (!openaiMsg) {
      return res.status(400).json({ success: false, error: "No research report found" });
    }

    // Get original topic
    const originalTopic = messages.filter((m) => m.is_user).shift()?.content || "Research Topic";
    const chatgptContent = openaiMsg.content;
    let geminiContent = geminiMsg ? geminiMsg.content : "";

    // If Gemini content missing, try to generate it
    if (!geminiContent) {
      try {
        const firstAi = aiMessages[0]?.content || "";
        const clarifyingQuestions = [];

        if (firstAi) {
          const matches = firstAi
            .split("\n")
            .filter((l) => /^\d+\.\s/.test(l))
            .map((l) => l.replace(/^\d+\.\s/, ""));
          if (matches.length) clarifyingQuestions.push(...matches);
        }

        const userAnswers = messages.filter((m) => m.is_user).slice(1).map((m) => m.content);
        const gemini = await GeminiService.generateResearchPage(originalTopic, clarifyingQuestions, userAnswers);

        if (gemini.success) {
          geminiContent = `## Gemini (Google) Research\n\n${gemini.researchPage || ""}`;
        }
      } catch (e) {
        console.error("Error generating Gemini content for email:", e);
      }
    }

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