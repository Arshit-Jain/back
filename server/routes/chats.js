// server/routes/chats.js
import express from "express";
import { userQueries, chatQueries, messageQueries, dailyChatQueries } from "../database/queries.js";
import { OpenAIService } from "../services/openai.js";
import { GeminiService } from "../services/gemini.js";

const router = express.Router();

// ===== Get all chats for user =====
router.get("/", async (req, res) => {
  try {
    const userId = req.user.id;
    const chats = await chatQueries.findByUserId(userId);
    res.json({ success: true, chats });
  } catch (error) {
    console.error("Get chats error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch chats" });
  }
});

// ===== Create new chat =====
router.post("/", async (req, res) => {
  try {
    const { title } = req.body;
    const userId = req.user.id;
    const user = await userQueries.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const canCreate = await dailyChatQueries.canCreateChat(userId, user.is_premium);
    if (!canCreate) {
      const limit = user.is_premium ? 20 : 5;
      return res.status(403).json({
        success: false,
        error: `Daily chat limit reached. You can create ${limit} chats per day.`,
      });
    }

    const newChat = await chatQueries.create(userId, title || "New Chat");
    await dailyChatQueries.incrementTodayCount(userId);
    res.json({ success: true, chat: newChat });
  } catch (error) {
    console.error("Create chat error:", error);
    res.status(500).json({ success: false, error: "Failed to create chat" });
  }
});

// ===== Get chat info =====
router.get("/:chatId", async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.id;
    const chat = await chatQueries.findById(chatId);

    if (!chat || chat.user_id !== userId) {
      return res.status(404).json({ success: false, error: "Chat not found" });
    }

    res.json({ success: true, chat });
  } catch (error) {
    console.error("Get chat info error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch chat info" });
  }
});

// ===== Get chat messages =====
router.get("/:chatId/messages", async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.id;
    const chat = await chatQueries.findById(chatId);

    if (!chat || chat.user_id !== userId) {
      return res.status(404).json({ success: false, error: "Chat not found" });
    }

    const messages = await messageQueries.findByChatId(chatId);
    res.json({ success: true, messages });
  } catch (error) {
    console.error("Get messages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch messages" });
  }
});

// ===== Start research topic =====
router.post("/:chatId/research-topic", async (req, res) => {
  try {
    const { chatId } = req.params;
    const { message } = req.body;
    const userId = req.user.id;

    const chat = await chatQueries.findById(chatId);
    if (!chat || chat.user_id !== userId) {
      return res.status(404).json({ success: false, error: "Chat not found" });
    }
    if (chat.is_completed || chat.has_error) {
      return res
        .status(400)
        .json({ success: false, error: "This chat is completed or has an error. Please start a new chat." });
    }

    await messageQueries.create(chatId, message, true);
    const result = await OpenAIService.generateTitleAndQuestions(message);

    if (result.success) {
      const generatedTitle = result.title;
      const questions = result.questions;
      await chatQueries.updateTitle(chatId, generatedTitle);

      const responseText = `I'd like to help you refine your research topic. To provide you with the most relevant research guidance, I have a few clarifying questions:\n\n${questions
        .map((q, i) => `${i + 1}. ${q}`)
        .join("\n\n")}\n\nPlease answer these questions one by one, and I'll create a comprehensive research plan for you.`;

      await messageQueries.create(chatId, responseText, false);

      res.json({
        success: true,
        response: responseText,
        messageType: "clarifying_questions",
        questions,
        title: generatedTitle,
      });
    } else {
      const errorResponse = "I'm not able to find the answer right now. Please try again.";
      await messageQueries.create(chatId, errorResponse, false);
      await chatQueries.markAsError(chatId);
      res.json({ success: true, response: errorResponse, title: "Research Topic..." });
    }
  } catch (error) {
    console.error("Research topic error:", error);
    res.status(500).json({ success: false, error: "Failed to process research topic" });
  }
});

// ===== Answer clarification questions =====
router.post("/:chatId/clarification-answer", async (req, res) => {
  try {
    const { chatId } = req.params;
    const { message, questionIndex, totalQuestions, originalTopic, questions, answers } = req.body;
    const userId = req.user.id;

    const chat = await chatQueries.findById(chatId);
    if (!chat || chat.user_id !== userId) {
      return res.status(404).json({ success: false, error: "Chat not found" });
    }
    if (chat.is_completed || chat.has_error) {
      return res
        .status(400)
        .json({ success: false, error: "This chat is completed or has an error. Please start a new chat." });
    }

    await messageQueries.create(chatId, message, true);

    if (questionIndex >= totalQuestions - 1) {
      // All questions answered - generate research
      let researchResult = { success: false };
      let geminiResult = { success: false };

      try {
        [researchResult, geminiResult] = await Promise.all([
          OpenAIService.generateResearchPage(originalTopic, questions, answers),
          GeminiService.generateResearchPage(originalTopic, questions, answers).catch(() => ({ success: false })),
        ]);
      } catch (e) {
        console.error("Error generating research:", e);
      }

      if (researchResult.success) {
        const openaiLabeled = `## ChatGPT (OpenAI) Research\n\n${researchResult.researchPage}`;
        const geminiLabeled =
          geminiResult?.success && geminiResult.researchPage
            ? `## Gemini (Google) Research\n\n${geminiResult.researchPage}`
            : null;

        await messageQueries.create(chatId, openaiLabeled, false);
        if (geminiLabeled) await messageQueries.create(chatId, geminiLabeled, false);
        await chatQueries.markAsCompleted(chatId);

        res.json({
          success: true,
          messageType: "research_pages",
          openaiResearch: openaiLabeled,
          geminiResearch: geminiLabeled,
        });
      } else {
        const errorResponse = "I'm not able to find the answer right now. Please try again.";
        await messageQueries.create(chatId, errorResponse, false);
        await chatQueries.markAsError(chatId);
        res.json({ success: true, response: errorResponse });
      }
    } else {
      // More questions to answer
      const responseText = `Thank you for your answer. Please answer the next question.`;
      await messageQueries.create(chatId, responseText, false);
      res.json({
        success: true,
        response: responseText,
        messageType: "acknowledgment",
      });
    }
  } catch (error) {
    console.error("Clarification answer error:", error);
    res.status(500).json({ success: false, error: "Failed to process clarification answer" });
  }
});

export default router;