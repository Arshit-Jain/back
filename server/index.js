import express from "express";
import cors from "cors";
import session from "express-session";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import passport from "passport";
import GoogleStrategy from "passport-google-oauth20";

import { userQueries, chatQueries, messageQueries, dailyChatQueries } from "./database/queries.js";
import { OpenAIService } from "./services/openai.js";
import { GeminiService } from "./services/gemini.js";
import { sendCombinedResearchReportSendGrid } from "./services/emailService.js";

dotenv.config();

const app = express();

// Trust proxy so HTTPS and host are respected behind Render/Heroku
app.set('trust proxy', 1);

// Normalize URLs by removing trailing slashes
const normalizeUrl = (url) => (url || '').replace(/\/+$/, '');
const FRONTEND_URL = normalizeUrl(process.env.FRONTEND_URL || "http://localhost:5173");
const BACKEND_URL = normalizeUrl(process.env.BACKEND_URL || "http://localhost:3000");

// CORS
app.use(cors({
    origin: FRONTEND_URL,
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sessions (secure in production; sameSite none for cross-site cookies)
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    },
    proxy: true
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await userQueries.findById(id);
        done(null, user);
    } catch (e) {
        done(e);
    }
});

passport.use(new GoogleStrategy.Strategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${BACKEND_URL}/auth/google/callback`,
    proxy: true
}, async (accessToken, refreshToken, profile, done) => {
    try {
        if (!profile.emails || !profile.emails[0]) {
            return done(new Error('No email provided by Google'));
        }
        const email = profile.emails[0].value;
        let user = await userQueries.findByEmail(email);
        if (!user) {
            const toBaseUsername = (name) => {
                const raw = (name || '').toString().toLowerCase();
                const sanitized = raw
                    .replace(/\s+/g, '_')
                    .replace(/[^a-z0-9_]/g, '')
                    .replace(/_+/g, '_')
                    .replace(/^_+|_+$/g, '')
                    .slice(0, 20);
                return sanitized || `user_${(profile.id || '').toString().slice(0, 6)}`;
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
            const baseFromEmail = email.split('@')[0];
            const base = toBaseUsername(baseFromDisplay || baseFromEmail || profile.id);
            const uniqueUsername = await generateUniqueUsername(base);
            user = await userQueries.create(uniqueUsername, email, "google-oauth", false);
        }
        return done(null, user);
    } catch (err) {
        return done(err);
    }
}));

// Auth endpoints
app.get("/auth/google", (req, res, next) => {
    passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
});

app.get("/auth/google/callback",
    (req, res, next) => {
        passport.authenticate("google", {
            failureRedirect: `${FRONTEND_URL}/login?error=oauth_failed`,
            session: true,
        })(req, res, next);
    },
    (req, res) => {
        req.session.userId = req.user.id;
        req.session.username = req.user.username;
        req.session.save((err) => {
            if (err) return res.redirect(`${FRONTEND_URL}/login?error=session_failed`);
            res.redirect(FRONTEND_URL);
        });
    }
);

// Auth middleware
const requireAuth = (req, res, next) => {
    if (req.session.userId) {
        next();
    } else {
        res.status(401).json({ error: 'Authentication required', redirect: '/login' });
    }
};

// Health and debug endpoints
app.get("/health", (req, res) => {
    res.json({ status: "ok", ts: Date.now(), env: process.env.NODE_ENV || 'development' });
});

app.get("/debug/session", (req, res) => {
    res.json({ id: req.sessionID, userId: req.session?.userId, cookie: req.session?.cookie });
});

// Basic routes
app.get("/", (req, res) => {
  res.send("Hello World");
});

app.get("/welcome", (req, res) => {
  res.json({ message: "Welcome to the server" });
});

// Auth APIs
app.post("/api/register", async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ success: false, error: 'All fields are required' });
        }

        const existingUser = await userQueries.findByUsername(username);
        if (existingUser) {
            return res.status(400).json({ success: false, error: 'Username already exists' });
        }

        const existingEmail = await userQueries.findByEmail(email);
        if (existingEmail) {
            return res.status(400).json({ success: false, error: 'Email already exists' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ success: false, error: 'Invalid email format' });
        }

        if (password.length < 6) {
            return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const newUser = await userQueries.create(username, email, passwordHash, false);

        req.session.userId = newUser.id;
        req.session.username = newUser.username;

        res.json({ success: true, user: { id: newUser.id, username: newUser.username, email: newUser.email, is_premium: newUser.is_premium } });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post("/api/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await userQueries.findByUsername(username);
        if (user && await bcrypt.compare(password, user.password_hash)) {
            req.session.userId = user.id;
            req.session.username = user.username;
            await userQueries.updateLastLogin(user.id);
            res.json({ success: true, user: { id: user.id, username: user.username, email: user.email, is_premium: user.is_premium } });
        } else {
            res.status(401).json({ success: false, error: 'Invalid credentials' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post("/api/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) return res.status(500).json({ success: false, error: 'Could not log out' });
        res.json({ success: true, message: 'Logged out successfully' });
    });
});

app.get("/api/auth/status", async (req, res) => {
    try {
        if (req.session.userId) {
            const user = await userQueries.findById(req.session.userId);
            if (user) {
                return res.json({ authenticated: true, user: { id: user.id, username: user.username, email: user.email, is_premium: user.is_premium } });
            }
        }
        res.json({ authenticated: false });
    } catch (error) {
        console.error('Auth status error:', error);
        res.json({ authenticated: false });
    }
});

// Chat APIs
app.get("/api/chats", requireAuth, async (req, res) => {
    try {
        const chats = await chatQueries.findByUserId(req.session.userId);
        res.json({ success: true, chats });
    } catch (error) {
        console.error('Get chats error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch chats' });
    }
});

app.post("/api/chats", requireAuth, async (req, res) => {
    try {
        const { title } = req.body;
        const userId = req.session.userId;
        const user = await userQueries.findById(userId);
        const canCreate = await dailyChatQueries.canCreateChat(userId, user.is_premium);
        if (!canCreate) {
            const limit = user.is_premium ? 20 : 5;
            return res.status(403).json({ success: false, error: `Daily chat limit reached. You can create ${limit} chats per day.` });
        }
        const newChat = await chatQueries.create(userId, title || "New Chat");
        await dailyChatQueries.incrementTodayCount(userId);
        res.json({ success: true, chat: newChat });
    } catch (error) {
        console.error('Create chat error:', error);
        res.status(500).json({ success: false, error: 'Failed to create chat' });
    }
});

app.get("/api/chats/:chatId", requireAuth, async (req, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.session.userId;
        const chat = await chatQueries.findById(chatId);
        if (!chat || chat.user_id !== userId) {
            return res.status(404).json({ success: false, error: 'Chat not found' });
        }
        res.json({ success: true, chat });
    } catch (error) {
        console.error('Get chat info error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch chat info' });
    }
});

app.get("/api/chats/:chatId/messages", requireAuth, async (req, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.session.userId;
        const chat = await chatQueries.findById(chatId);
        if (!chat || chat.user_id !== userId) {
            return res.status(404).json({ success: false, error: 'Chat not found' });
        }
        const messages = await messageQueries.findByChatId(chatId);
        res.json({ success: true, messages });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch messages' });
    }
});

// Step 1: Research topic
app.post("/api/chats/:chatId/research-topic", requireAuth, async (req, res) => {
    try {
        const { chatId } = req.params;
        const { message } = req.body;
        const userId = req.session.userId;
        const chat = await chatQueries.findById(chatId);
        if (!chat || chat.user_id !== userId) {
            return res.status(404).json({ success: false, error: 'Chat not found' });
        }
        if (chat.is_completed || chat.has_error) {
            return res.status(400).json({ success: false, error: 'This chat is completed or has an error. Please start a new chat.' });
        }
        await messageQueries.create(chatId, message, true);
        const result = await OpenAIService.generateTitleAndQuestions(message);
        if (result.success) {
            const generatedTitle = result.title;
            const questions = result.questions;
            await chatQueries.updateTitle(chatId, generatedTitle);
            const responseText = `I'd like to help you refine your research topic. To provide you with the most relevant research guidance, I have a few clarifying questions:\n\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n\n')}\n\nPlease answer these questions one by one, and I'll create a comprehensive research plan for you.`;
            await messageQueries.create(chatId, responseText, false);
            res.json({ success: true, response: responseText, messageType: 'clarifying_questions', questions, title: generatedTitle, user: req.session.username });
        } else {
            const errorResponse = "I'm not able to find the answer right now. Please try again.";
            await messageQueries.create(chatId, errorResponse, false);
            await chatQueries.markAsError(chatId);
            res.json({ success: true, response: errorResponse, title: 'Research Topic...', user: req.session.username });
        }
    } catch (error) {
        console.error('Research topic error:', error);
        res.status(500).json({ success: false, error: 'Failed to process research topic' });
    }
});

// Step 2: Clarification answer
app.post("/api/chats/:chatId/clarification-answer", requireAuth, async (req, res) => {
    try {
        const { chatId } = req.params;
        const { message, questionIndex, totalQuestions, originalTopic, questions, answers } = req.body;
        const userId = req.session.userId;
        const chat = await chatQueries.findById(chatId);
        if (!chat || chat.user_id !== userId) {
            return res.status(404).json({ success: false, error: 'Chat not found' });
        }
        if (chat.is_completed || chat.has_error) {
            return res.status(400).json({ success: false, error: 'This chat is completed or has an error. Please start a new chat.' });
        }
        await messageQueries.create(chatId, message, true);
        if (questionIndex >= totalQuestions - 1) {
            let researchResult = { success: false };
            let geminiResult = { success: false };
            try {
                [researchResult, geminiResult] = await Promise.all([
                    OpenAIService.generateResearchPage(originalTopic, questions, answers),
                    GeminiService.generateResearchPage(originalTopic, questions, answers).catch(() => ({ success: false }))
                ]);
            } catch (e) {}

            if (researchResult.success) {
                const openaiLabeled = `## ChatGPT (OpenAI) Research\n\n${researchResult.researchPage}`;
                const geminiLabeled = (geminiResult && geminiResult.success && geminiResult.researchPage)
                  ? `## Gemini (Google) Research\n\n${geminiResult.researchPage}`
                  : null;
                await messageQueries.create(chatId, openaiLabeled, false);
                if (geminiLabeled) await messageQueries.create(chatId, geminiLabeled, false);
                await chatQueries.markAsCompleted(chatId);
                res.json({ success: true, messageType: 'research_pages', openaiResearch: openaiLabeled, geminiResearch: geminiLabeled, user: req.session.username });
            } else {
                const errorResponse = "I'm not able to find the answer right now. Please try again.";
                await messageQueries.create(chatId, errorResponse, false);
                await chatQueries.markAsError(chatId);
                res.json({ success: true, response: errorResponse, user: req.session.username });
            }
        } else {
            const responseText = `Thank you for your answer. Please answer the next question.`;
            await messageQueries.create(chatId, responseText, false);
            res.json({ success: true, response: responseText, messageType: 'acknowledgment', user: req.session.username });
        }
    } catch (error) {
        console.error('Clarification answer error:', error);
        res.status(500).json({ success: false, error: 'Failed to process clarification answer' });
    }
});

// Legacy message endpoint
app.post("/api/chats/:chatId/messages", requireAuth, async (req, res) => {
    try {
        const { chatId } = req.params;
        const { message, messageType = 'regular' } = req.body;
        const userId = req.session.userId;
        const chat = await chatQueries.findById(chatId);
        if (!chat || chat.user_id !== userId) {
            return res.status(404).json({ success: false, error: 'Chat not found' });
        }
        await messageQueries.create(chatId, message, true);
        const result = await OpenAIService.generateTitleAndQuestions(message);
        if (result.success) {
            const generatedTitle = result.title;
            const questions = result.questions;
            await chatQueries.updateTitle(chatId, generatedTitle);
            const responseText = `I'd like to help you refine your research topic. To provide you with the most relevant research guidance, I have a few clarifying questions:\n\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n\n')}`;
            await messageQueries.create(chatId, responseText, false);
            res.json({ success: true, response: responseText, messageType: 'clarifying_questions', questions, title: generatedTitle, user: req.session.username });
        } else {
            const errorResponse = "I'm not able to find the answer right now. Please try again.";
            await messageQueries.create(chatId, errorResponse, false);
            await chatQueries.markAsError(chatId);
            res.json({ success: true, response: errorResponse, title: 'Research Topic...', user: req.session.username });
        }
    } catch (error) {
        console.error('Legacy message error:', error);
        res.status(500).json({ success: false, error: 'Failed to send message' });
    }
});

// User limits
app.get("/api/user/chat-count", requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId;
        const user = await userQueries.findById(userId);
        const todayCount = await dailyChatQueries.getTodayCount(userId);
        const maxChats = user.is_premium ? 20 : 5;
        res.json({ success: true, todayCount, maxChats, isPremium: user.is_premium });
    } catch (error) {
        console.error('Get chat count error:', error);
        res.status(500).json({ success: false, error: 'Failed to get chat count' });
    }
});

// Email
app.post("/api/chats/:chatId/send-email", requireAuth, async (req, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.session.userId;
        const chat = await chatQueries.findById(chatId);
        if (!chat || chat.user_id !== userId) {
            return res.status(404).json({ success: false, error: 'Chat not found' });
        }
        const user = await userQueries.findById(userId);
        if (!user || !user.email) {
            return res.status(400).json({ success: false, error: 'User email not found' });
        }
        const messages = await messageQueries.findByChatId(chatId);
        if (!messages || messages.length === 0) {
            return res.status(400).json({ success: false, error: 'No messages found in chat' });
        }
        const aiMessages = messages.filter(msg => !msg.is_user);
        const openaiMsg = aiMessages.find(m => (m.content || '').startsWith('## ChatGPT (OpenAI) Research')) || aiMessages[0];
        const geminiMsg = aiMessages.find(m => (m.content || '').startsWith('## Gemini (Google) Research')) || null;
        if (!openaiMsg) {
            return res.status(400).json({ success: false, error: 'No research report found' });
        }
        const originalTopic = messages.filter(msg => msg.is_user).shift()?.content || 'Research Topic';
        const chatgptContent = openaiMsg.content;
        let geminiContent = geminiMsg ? geminiMsg.content : '';
        if (!geminiContent) {
            try {
                const firstAi = aiMessages[0]?.content || '';
                const clarifyingQuestions = [];
                if (firstAi) {
                    const matches = firstAi.split('\n').filter(l => /^\d+\.\s/.test(l)).map(l => l.replace(/^\d+\.\s/, ''))
                    if (matches.length) clarifyingQuestions.push(...matches)
                }
                const userAnswers = messages.filter(m => m.is_user).slice(1).map(m => m.content)
                const gemini = await GeminiService.generateResearchPage(originalTopic, clarifyingQuestions, userAnswers)
                if (gemini.success) {
                    geminiContent = `## Gemini (Google) Research\n\n${gemini.researchPage || ''}`
                }
            } catch (e) {}
        }
        const result = await sendCombinedResearchReportSendGrid(
            user.email,
            chatgptContent,
            geminiContent || '## Gemini (Google) Research\n\nNo Gemini content available.',
            originalTopic
        );
        res.json({ success: true, message: 'Research report sent successfully', messageId: result.messageId, summary: result.summary });
    } catch (error) {
        console.error('Email endpoint error:', error);
        res.status(500).json({ success: false, error: 'Failed to send research report', details: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});


