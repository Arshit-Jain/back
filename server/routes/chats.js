// server/routes/chats.js
import express from "express";
import { userQueries, chatQueries, messageQueries, dailyChatQueries } from "../database/queries.js";
import { OpenAIService } from "../services/openai.js";
import { GeminiService } from "../services/gemini.js";

const router = express.Router();

// Helper function to clean up research content for better PDF formatting
function cleanResearchContent(content, provider) {
  if (!content) return '';
  
  // Remove duplicate headers and clean up formatting
  let cleaned = content
    // Remove duplicate provider headers and variations
    .replace(new RegExp(`^#+\\s*${provider}[\\s\\n]*Research[\\s\\n]*`, 'gmi'), '')
    .replace(new RegExp(`^#+\\s*${provider}[\\s\\n]*`, 'gmi'), '')
    .replace(/^#+\s*Research\s*Page:?\s*/gmi, '')
    .replace(/^#+\s*Comparative\s*Analysis\s*/gmi, '')
    // Remove "I'd like to help you..." preamble from ChatGPT
    .replace(/^I'd like to help you.*?comprehensive research (?:for you|plan for you)\.?\s*/gis, '')
    .replace(/^I'd like to help you.*?Please answer.*?one by one.*?\.?\s*/gis, '')
    // Remove clarifying questions sections
    .replace(/^#+\s*Clarifying Questions.*?(?=^#+\s*[A-Z]|\n\n[A-Z])/gims, '')
    .replace(/To provide you with.*?I have.*?questions:?\s*/gi, '')
    .replace(/Please answer.*?questions.*?one by one.*?\./gi, '')
    // Remove methodology suggestion sections (these are advice, not research)
    .replace(/^#+\s*Proposed Methodology.*?(?=^#+\s*[A-Z])/gims, '')
    .replace(/^#+\s*Research Methodology.*?(?=^#+\s*[A-Z])/gims, '')
    .replace(/^#+\s*Suggested Research Methods?.*?(?=^#+\s*[A-Z])/gims, '')
    // Remove numbered question lists
    .replace(/\n\d+\.\s+(?:Which|What|How|Are|Do|Does|Is|Can|Should|Would|Will)[^\n]+\?/g, '')
    // Remove ALL markdown bold formatting (multiple aggressive patterns)
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')  // Triple asterisks
    .replace(/\*\*([^*]+)\*\*/g, '$1')       // Double asterisks
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')     // Double asterisks (no newline)
    .replace(/\*\*([^*\n]*?)\*\*/g, '$1')    // Double asterisks (lazy)
    .replace(/\*\*([^*]*?)\*\*/g, '$1')      // Double asterisks (very lazy)
    .replace(/\*([^*]+)\*/g, '$1')           // Single asterisks
    .replace(/\*\*/g, '')                     // Any remaining **
    .replace(/\*/g, '')                       // Any remaining *
    // Second pass to catch any that got through
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*\*/g, '')
    // Third pass for nested or complex cases
    .replace(/\*+([^*\n]+)\*+/g, '$1')
    // Clean up links - make them more readable
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    // Remove extra whitespace and line breaks
    .replace(/\n{3,}/g, '\n\n')
    // Clean up numbered lists formatting
    .replace(/^\d+\)\s*/gm, '- ')
    .replace(/^\d+\.\s*/gm, '- ')
    // Remove extra spaces
    .replace(/[ \t]+$/gm, '')
    .trim();
  
  return cleaned;
}

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
        .join("\n\n")}\n\nPlease answer these questions one by one, and I'll do a comprehensive research for you.`;

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
        // Clean up the research content for better formatting
        const cleanedOpenAI = cleanResearchContent(researchResult.researchPage, 'ChatGPT|OpenAI');
        const cleanedGemini = geminiResult?.success && geminiResult.researchPage 
          ? cleanResearchContent(geminiResult.researchPage, 'Gemini|Google')
          : null;
        
        // Additional aggressive cleaning for Gemini content - multiple passes
        let finalGemini = cleanedGemini;
        if (finalGemini) {
          // Pass 1: Standard cleaning
          finalGemini = finalGemini
            .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/\*\*/g, '')
            .replace(/\*/g, '');
          
          // Pass 2: Aggressive cleaning for any remaining
          finalGemini = finalGemini
            .replace(/\*\*([^*\n]*?)\*\*/g, '$1')
            .replace(/\*\*([^*]*?)\*\*/g, '$1')
            .replace(/\*+([^*\n]+)\*+/g, '$1')
            .replace(/\*+/g, '');
          
          // Pass 3: Final cleanup
          finalGemini = finalGemini
            .replace(/\*\*/g, '')
            .replace(/\*/g, '')
            .trim();
        }

        const openaiLabeled = `# ChatGPT (OpenAI) Research\n\n${cleanedOpenAI}`;
        const geminiLabeled = finalGemini 
          ? `# Gemini (Google) Research\n\n${finalGemini}`
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