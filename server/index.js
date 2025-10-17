// server/index.js
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import passport from "passport";
import GoogleStrategy from "passport-google-oauth20";
import pool from "./database/connection.js";
import jwt from "jsonwebtoken";

import {
  userQueries,
  chatQueries,
  messageQueries,
  dailyChatQueries
} from "./database/queries.js";

import { OpenAIService } from "./services/openai.js";
import { GeminiService } from "./services/gemini.js";
import { sendCombinedResearchReportSendGrid } from "./services/emailService.js";

dotenv.config();

const app = express();

const JWT_SECRET = process.env.JWT_SECRET || "your-jwt-secret-change-in-production";

// Normalize URLs helper
const normalizeUrl = (url) => (url || "").replace(/\/+$/, "");
const FRONTEND_URL = normalizeUrl(process.env.FRONTEND_URL || "http://localhost:5173");
const BACKEND_URL = normalizeUrl(process.env.BACKEND_URL || "http://localhost:3000");

// Trust proxy for proper redirect/origin detection behind Render/Vercel
app.set("trust proxy", 1);

// CORS (no sessions/cookies required)
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --------------------
// Passport (Google) - NO SESSIONS
// --------------------
passport.use(
  new GoogleStrategy.Strategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${BACKEND_URL}/auth/google/callback`,
      proxy: true,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log("=== Google Strategy Called ===");
        console.log("Profile ID:", profile.id);
        if (!profile.emails || !profile.emails[0]) {
          console.error("No email in Google profile");
          return done(new Error("No email provided by Google"));
        }

        const email = profile.emails[0].value.toLowerCase();
        let user = await userQueries.findByEmail(email);

        if (!user) {
          // create username from displayName or email local-part
          const toBaseUsername = (name) => {
            const raw = (name || "").toString().toLowerCase();
            const sanitized = raw
              .replace(/\s+/g, "_")
              .replace(/[^a-z0-9_]/g, "")
              .replace(/_+/g, "_")
              .replace(/^_+|_+$/g, "")
              .slice(0, 20);
            return sanitized || `user_${(profile.id || "").toString().slice(0, 6)}`;
          };

          const generateUniqueUsername = async (base) => {
            for (let i = 0; i < 10; i++) {
              const suffix = Math.random().toString().slice(2, 8);
              const candidate = `${base}_${suffix}`;
              const exists = await userQueries.findByUsername(candidate);
              if (!exists) return candidate;
            }
            return `${base}_${Date.now().toString().slice(-6)}`;
          };

          const baseFromDisplay = profile.displayName;
          const baseFromEmail = email.split("@")[0];
          const base = toBaseUsername(baseFromDisplay || baseFromEmail || profile.id);
          const uniqueUsername = await generateUniqueUsername(base);

          user = await userQueries.create(uniqueUsername, email, "google-oauth", false);
          console.log("User created successfully:", user.id);
        } else {
          console.log("User already exists:", user.id);
        }

        // Do NOT serialize into a session; just return the user
        done(null, user);
      } catch (err) {
        console.error("Google Strategy error:", err);
        done(err);
      }
    }
  )
);

// We do not use passport.serializeUser / deserializeUser because we don't use sessions

// --------------------
// Auth routes (Google OAuth) - issue JWT on success
// --------------------

// Initiate Google OAuth
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"], session: false })
);

// Callback: Passport will set req.user if successful; we sign a JWT and redirect with token
app.get(
    "/auth/google/callback",
    passport.authenticate("google", {
      session: false,
      failureRedirect: `${FRONTEND_URL}/login?error=oauth_failed`,
    }),
    (req, res) => {
      try {
        if (!req.user) {
          return res.redirect(`${FRONTEND_URL}/login?error=no_user`);
        }
  
        const user = req.user;
        const tokenPayload = {
          id: user.id,
          username: user.username,
          email: user.email,
          is_premium: user.is_premium || false,
        };
  
        const jwtToken = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: "7d" });
  
        const redirectUrl = `${FRONTEND_URL}/login?token=${encodeURIComponent(jwtToken)}&oauth=success`;
        console.log("=== OAuth success, redirecting with JWT ===", redirectUrl);
        return res.redirect(redirectUrl);
      } catch (err) {
        console.error("OAuth callback handler error:", err);
        return res.redirect(`${FRONTEND_URL}/login?error=server_error`);
      }
    }
);

// Optional: endpoint to exchange temporary tokens (if your frontend sends base64 token flow)
// If you don't use this flow, you can remove it. Keeping commented for reference.
/*
app.post("/api/auth/oauth-complete", async (req, res) => {
  // If you still need to support the previous base64 temp token -> JWT exchange,
  // implement it here. For a typical OAuth JWT flow the callback above is enough.
});
*/

// --------------------
// JWT middleware
// --------------------
const authenticateJWT = (req, res, next) => {
  try {
    // Look for Authorization header: "Bearer <token>"
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (req.query && req.query.token) {
      // allow token in query for special cases (e.g. initial redirect)
      token = req.query.token;
    } else if (req.body && req.body.token) {
      token = req.body.token;
    }

    if (!token) {
      return res.status(401).json({ error: "Authentication required", redirect: "/login" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    // Attach user info to req.user
    req.user = decoded;
    next();
  } catch (error) {
    console.error("JWT verification failed:", error?.message || error);
    return res.status(401).json({ error: "Invalid or expired token", redirect: "/login" });
  }
};

// Use authenticateJWT for protected routes
const requireAuth = authenticateJWT;

// --------------------
// Basic endpoints
// --------------------
app.get("/test", (req, res) => {
  res.json({ message: "Server is working", timestamp: new Date().toISOString() });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", ts: Date.now(), env: process.env.NODE_ENV || "development" });
});

// Debug endpoint showing current user (if JWT provided)
app.get("/debug/session", (req, res) => {
  // Attempt to parse token and show decoded user if present
  const authHeader = req.headers.authorization;
  let token = null;
  if (authHeader && authHeader.startsWith("Bearer ")) token = authHeader.split(" ")[1];
  else if (req.query && req.query.token) token = req.query.token;

  if (!token) {
    return res.json({ user: null });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return res.json({ user: decoded });
  } catch (err) {
    return res.json({ user: null, error: "invalid_token" });
  }
});

// --------------------
// Auth APIs (email/password) - return JWT
// --------------------
app.post("/api/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ success: false, error: "All fields are required" });
    }

    const existingUser = await userQueries.findByUsername(username);
    if (existingUser) return res.status(400).json({ success: false, error: "Username already exists" });

    const existingEmail = await userQueries.findByEmail(email);
    if (existingEmail) return res.status(400).json({ success: false, error: "Email already exists" });

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = await userQueries.create(username, email, passwordHash, false);

    const token = jwt.sign(
      {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        is_premium: newUser.is_premium,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      token,
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        is_premium: newUser.is_premium,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await userQueries.findByUsername(username);

    if (user && (await bcrypt.compare(password, user.password_hash))) {
      const token = jwt.sign(
        {
          id: user.id,
          username: user.username,
          email: user.email,
          is_premium: user.is_premium,
        },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      await userQueries.updateLastLogin(user.id);

      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          is_premium: user.is_premium,
        },
      });
    } else {
      res.status(401).json({ success: false, error: "Invalid credentials" });
    }
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// --------------------
// Auth status - requires JWT
// --------------------
app.get("/api/auth/status", requireAuth, async (req, res) => {
  try {
    const user = await userQueries.findById(req.user.id);
    if (user) {
      return res.json({
        authenticated: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          is_premium: user.is_premium,
        },
      });
    }
    res.json({ authenticated: false });
  } catch (error) {
    console.error("Auth status error:", error);
    res.json({ authenticated: false });
  }
});

// --------------------
// Chat APIs - use req.user.id (JWT)
// --------------------
app.get("/api/chats", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const chats = await chatQueries.findByUserId(userId);
    res.json({ success: true, chats });
  } catch (error) {
    console.error("Get chats error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch chats" });
  }
});

app.post("/api/chats", requireAuth, async (req, res) => {
  try {
    const { title } = req.body;
    const userId = req.user.id;
    const user = await userQueries.findById(userId);
    if (!user) return res.status(401).json({ success: false, error: "Unauthorized" });

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

app.get("/api/chats/:chatId", requireAuth, async (req, res) => {
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

app.get("/api/chats/:chatId/messages", requireAuth, async (req, res) => {
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

// --------------------
// Research flows (unchanged except auth uses req.user.id)
// --------------------
app.post("/api/chats/:chatId/research-topic", requireAuth, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { message } = req.body;
    const userId = req.user.id;
    const chat = await chatQueries.findById(chatId);
    if (!chat || chat.user_id !== userId) {
      return res.status(404).json({ success: false, error: "Chat not found" });
    }
    if (chat.is_completed || chat.has_error) {
      return res.status(400).json({ success: false, error: "This chat is completed or has an error. Please start a new chat." });
    }

    await messageQueries.create(chatId, message, true);
    const result = await OpenAIService.generateTitleAndQuestions(message);
    if (result.success) {
      const generatedTitle = result.title;
      const questions = result.questions;
      await chatQueries.updateTitle(chatId, generatedTitle);
      const responseText = `I'd like to help you refine your research topic. To provide you with the most relevant research guidance, I have a few clarifying questions:\n\n${questions.map((q, i) => `${i + 1}. ${q}`).join("\n\n")}\n\nPlease answer these questions one by one, and I'll create a comprehensive research plan for you.`;
      await messageQueries.create(chatId, responseText, false);
      res.json({ success: true, response: responseText, messageType: "clarifying_questions", questions, title: generatedTitle, user: user.username });
    } else {
      const errorResponse = "I'm not able to find the answer right now. Please try again.";
      await messageQueries.create(chatId, errorResponse, false);
      await chatQueries.markAsError(chatId);
      res.json({ success: true, response: errorResponse, title: "Research Topic...", user: user.username });
    }
  } catch (error) {
    console.error("Research topic error:", error);
    res.status(500).json({ success: false, error: "Failed to process research topic" });
  }
});

app.post("/api/chats/:chatId/clarification-answer", requireAuth, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { message, questionIndex, totalQuestions, originalTopic, questions, answers } = req.body;
    const userId = req.user.id;
    const chat = await chatQueries.findById(chatId);
    if (!chat || chat.user_id !== userId) {
      return res.status(404).json({ success: false, error: "Chat not found" });
    }
    if (chat.is_completed || chat.has_error) {
      return res.status(400).json({ success: false, error: "This chat is completed or has an error. Please start a new chat." });
    }
    await messageQueries.create(chatId, message, true);

    if (questionIndex >= totalQuestions - 1) {
      let researchResult = { success: false };
      let geminiResult = { success: false };
      try {
        [researchResult, geminiResult] = await Promise.all([
          OpenAIService.generateResearchPage(originalTopic, questions, answers),
          GeminiService.generateResearchPage(originalTopic, questions, answers).catch(() => ({ success: false })),
        ]);
      } catch (e) {}

      if (researchResult.success) {
        const openaiLabeled = `## ChatGPT (OpenAI) Research\n\n${researchResult.researchPage}`;
        const geminiLabeled = geminiResult && geminiResult.success && geminiResult.researchPage
          ? `## Gemini (Google) Research\n\n${geminiResult.researchPage}`
          : null;
        await messageQueries.create(chatId, openaiLabeled, false);
        if (geminiLabeled) await messageQueries.create(chatId, geminiLabeled, false);
        await chatQueries.markAsCompleted(chatId);
        res.json({ success: true, messageType: "research_pages", openaiResearch: openaiLabeled, geminiResearch: geminiLabeled, user: user.username });
      } else {
        const errorResponse = "I'm not able to find the answer right now. Please try again.";
        await messageQueries.create(chatId, errorResponse, false);
        await chatQueries.markAsError(chatId);
        res.json({ success: true, response: errorResponse, user: user.username });
      }
    } else {
      const responseText = `Thank you for your answer. Please answer the next question.`;
      await messageQueries.create(chatId, responseText, false);
      res.json({ success: true, response: responseText, messageType: "acknowledgment", user: user.username });
    }
  } catch (error) {
    console.error("Clarification answer error:", error);
    res.status(500).json({ success: false, error: "Failed to process clarification answer" });
  }
});

// Legacy message endpoint (updated to use req.user)
app.post("/api/chats/:chatId/messages", requireAuth, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { message, messageType = "regular" } = req.body;
    const userId = req.user.id;
    const chat = await chatQueries.findById(chatId);
    if (!chat || chat.user_id !== userId) {
      return res.status(404).json({ success: false, error: "Chat not found" });
    }
    await messageQueries.create(chatId, message, true);
    const result = await OpenAIService.generateTitleAndQuestions(message);
    if (result.success) {
      const generatedTitle = result.title;
      const questions = result.questions;
      await chatQueries.updateTitle(chatId, generatedTitle);
      const responseText = `I'd like to help you refine your research topic. To provide you with the most relevant research guidance, I have a few clarifying questions:\n\n${questions.map((q, i) => `${i + 1}. ${q}`).join("\n\n")}`;
      await messageQueries.create(chatId, responseText, false);
      res.json({ success: true, response: responseText, messageType: "clarifying_questions", questions, title: generatedTitle, user: user.username });
    } else {
      const errorResponse = "I'm not able to find the answer right now. Please try again.";
      await messageQueries.create(chatId, errorResponse, false);
      await chatQueries.markAsError(chatId);
      res.json({ success: true, response: errorResponse, title: "Research Topic...", user: user.username });
    }
  } catch (error) {
    console.error("Legacy message error:", error);
    res.status(500).json({ success: false, error: "Failed to send message" });
  }
});

// --------------------
// User limits (chat count) - uses req.user.id
// --------------------
app.get("/api/user/chat-count", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await userQueries.findById(userId);
    if (!user) return res.status(401).json({ success: false, error: "Unauthorized" });

    const todayCount = await dailyChatQueries.getTodayCount(userId);
    const maxChats = user.is_premium ? 20 : 5;
    res.json({ success: true, todayCount, maxChats, isPremium: user.is_premium });
  } catch (error) {
    console.error("Get chat count error:", error);
    res.status(500).json({ success: false, error: "Failed to get chat count" });
  }
});

// --------------------
// Email: send research report
// --------------------
app.post("/api/chats/:chatId/send-email", requireAuth, async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.id;
    const chat = await chatQueries.findById(chatId);
    if (!chat || chat.user_id !== userId) {
      return res.status(404).json({ success: false, error: "Chat not found" });
    }
    const user = await userQueries.findById(userId);
    if (!user || !user.email) {
      return res.status(400).json({ success: false, error: "User email not found" });
    }
    const messages = await messageQueries.findByChatId(chatId);
    if (!messages || messages.length === 0) {
      return res.status(400).json({ success: false, error: "No messages found in chat" });
    }

    const aiMessages = messages.filter((m) => !m.is_user);
    const openaiMsg = aiMessages.find((m) => (m.content || "").startsWith("## ChatGPT (OpenAI) Research")) || aiMessages[0];
    const geminiMsg = aiMessages.find((m) => (m.content || "").startsWith("## Gemini (Google) Research")) || null;
    if (!openaiMsg) {
      return res.status(400).json({ success: false, error: "No research report found" });
    }

    const originalTopic = messages.filter((m) => m.is_user).shift()?.content || "Research Topic";
    const chatgptContent = openaiMsg.content;
    let geminiContent = geminiMsg ? geminiMsg.content : "";

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
      } catch (e) {}
    }

    const result = await sendCombinedResearchReportSendGrid(
      user.email,
      chatgptContent,
      geminiContent || "## Gemini (Google) Research\n\nNo Gemini content available.",
      originalTopic
    );

    res.json({ success: true, message: "Research report sent successfully", messageId: result.messageId, summary: result.summary });
  } catch (error) {
    console.error("Email endpoint error:", error);
    res.status(500).json({ success: false, error: "Failed to send research report", details: error.message });
  }
});

// --------------------
// Finalize: start server
// --------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server (JWT-only) is running on port ${PORT}`);
});