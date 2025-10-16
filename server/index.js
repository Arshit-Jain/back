import express from "express";
import cors from "cors";
import session from "express-session";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { userQueries, chatQueries, messageQueries, dailyChatQueries } from "./database/queries.js";
import passport from "passport";
import GoogleStrategy from "passport-google-oauth20";
import { OpenAIService } from "./services/openai.js";
import { GeminiService } from "./services/gemini.js";
import { sendCombinedResearchReportSendGrid } from "./services/emailService.js";

dotenv.config();

const app = express();

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to true in production with HTTPS
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Initialize passport, must be after session middleware
app.use(passport.initialize());
app.use(passport.session());

// Serialize user (via ID)
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

// Passport Google Strategy
passport.use(new GoogleStrategy.Strategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "https://back-multi-api.onrender.com/auth/google/callback",
    proxy: true  // ⚠️ IMPORTANT: This tells Passport to trust the proxy (Render)
}, async (accessToken, refreshToken, profile, done) => {
    try {
        // Use Google ID as username fallback
        let user = await userQueries.findByEmail(profile.emails[0].value);
        if (!user) {
            // Generate a unique username by appending random digits
            const toBaseUsername = (name) => {
                // Prefer displayName -> email local part -> profile id
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
                // Try several random suffixes before falling back to timestamp
                for (let i = 0; i < 10; i++) {
                    const suffix = Math.random().toString().slice(2, 8); // 6 digits
                    const candidate = `${base}_${suffix}`;
                    const exists = await userQueries.findByUsername(candidate);
                    if (!exists) return candidate;
                }
                return `${base}_${Date.now().toString().slice(-6)}`;
            };

            const baseFromDisplay = profile.displayName;
            const baseFromEmail = (profile.emails && profile.emails[0] && profile.emails[0].value)
                ? profile.emails[0].value.split('@')[0]
                : '';
            const base = toBaseUsername(baseFromDisplay || baseFromEmail || profile.id);
            const uniqueUsername = await generateUniqueUsername(base);

            user = await userQueries.create(
                uniqueUsername,
                profile.emails[0].value,
                "google-oauth",
                false
            );
        }
        return done(null, user);
    } catch (err) {
        return done(err);
    }
}));

// Auth endpoint for Google
app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
// Google callback
app.get("/auth/google/callback", passport.authenticate("google", {
    failureRedirect: "/login",
    session: true,
}), (req, res) => {
    // For API: Set session and respond with success (if you want frontend to handle it differently, adjust here)
    req.session.userId = req.user.id;
    req.session.username = req.user.username;
    // Instruct browser to redirect to client app after login
    res.redirect(process.env.FRONTEND_URL || "http://localhost:5173");
});

// Authentication middleware
const requireAuth = (req, res, next) => {
    if (req.session.userId) {
        next();
    } else {
        res.status(401).json({ error: 'Authentication required', redirect: '/login' });
    }
};

// Routes
app.get("/", (req, res) => {
  res.send("Hello World");
});

app.get("/welcome", (req, res) => {
  res.json({ message: "Welcome to the server" });
});

// Authentication routes
app.post("/api/register", async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        // Basic validation
        if (!username || !email || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'All fields are required' 
            });
        }
        
        // Check if username already exists
        const existingUser = await userQueries.findByUsername(username);
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                error: 'Username already exists' 
            });
        }
        
        // Check if email already exists
        const existingEmail = await userQueries.findByEmail(email);
        if (existingEmail) {
            return res.status(400).json({ 
                success: false, 
                error: 'Email already exists' 
            });
        }
        
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid email format' 
            });
        }
        
        // Password length validation
        if (password.length < 6) {
            return res.status(400).json({ 
                success: false, 
                error: 'Password must be at least 6 characters long' 
            });
        }
        
        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);
        
        // Create new user
        const newUser = await userQueries.create(username, email, passwordHash, false);
        
        // Auto-login after registration
        req.session.userId = newUser.id;
        req.session.username = newUser.username;
        
        res.json({ 
            success: true, 
            user: { 
                id: newUser.id, 
                username: newUser.username, 
                email: newUser.email,
                is_premium: newUser.is_premium
            } 
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

app.post("/api/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const user = await userQueries.findByUsername(username);
        
        if (user && await bcrypt.compare(password, user.password_hash)) {
            req.session.userId = user.id;
            req.session.username = user.username;
            
            // Update last login
            await userQueries.updateLastLogin(user.id);
            
            res.json({ 
                success: true, 
                user: { 
                    id: user.id, 
                    username: user.username, 
                    email: user.email,
                    is_premium: user.is_premium
                } 
            });
        } else {
            res.status(401).json({ 
                success: false, 
                error: 'Invalid credentials' 
            });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

app.post("/api/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            res.status(500).json({ success: false, error: 'Could not log out' });
        } else {
            res.json({ success: true, message: 'Logged out successfully' });
        }
    });
});

app.get("/api/auth/status", async (req, res) => {
    try {
        if (req.session.userId) {
            const user = await userQueries.findById(req.session.userId);
            if (user) {
                res.json({ 
                    authenticated: true, 
                    user: { 
                        id: user.id, 
                        username: user.username, 
                        email: user.email,
                        is_premium: user.is_premium
                    } 
                });
            } else {
                res.json({ authenticated: false });
            }
        } else {
            res.json({ authenticated: false });
        }
    } catch (error) {
        console.error('Auth status error:', error);
        res.json({ authenticated: false });
    }
});

// Get user chats
app.get("/api/chats", requireAuth, async (req, res) => {
    try {
        const chats = await chatQueries.findByUserId(req.session.userId);
        res.json({ success: true, chats });
    } catch (error) {
        console.error('Get chats error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch chats' });
    }
});

// Create new chat
app.post("/api/chats", requireAuth, async (req, res) => {
    try {
        const { title } = req.body;
        const userId = req.session.userId;
        
        // Get user info to check premium status
        const user = await userQueries.findById(userId);
        
        // Check if user can create new chat
        const canCreate = await dailyChatQueries.canCreateChat(userId, user.is_premium);
        
        if (!canCreate) {
            const limit = user.is_premium ? 20 : 5;
            return res.status(403).json({ 
                success: false, 
                error: `Daily chat limit reached. You can create ${limit} chats per day.` 
            });
        }
        
        // Create new chat
        const newChat = await chatQueries.create(userId, title || "New Chat");
        
        // Increment daily chat count
        await dailyChatQueries.incrementTodayCount(userId);
        
        res.json({ success: true, chat: newChat });
    } catch (error) {
        console.error('Create chat error:', error);
        res.status(500).json({ success: false, error: 'Failed to create chat' });
    }
});

// Get chat info
app.get("/api/chats/:chatId", requireAuth, async (req, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.session.userId;
        
        // Verify chat belongs to user
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

// Get chat messages
app.get("/api/chats/:chatId/messages", requireAuth, async (req, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.session.userId;
        
        // Verify chat belongs to user
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

// Step 1: Process initial research topic
app.post("/api/chats/:chatId/research-topic", requireAuth, async (req, res) => {
    try {
        console.log('=== RESEARCH TOPIC ENDPOINT ===');
        const { chatId } = req.params;
        const { message } = req.body;
        const userId = req.session.userId;
        
        console.log('Processing research topic:', { chatId, userId, message });
        
        // Verify chat belongs to user
        const chat = await chatQueries.findById(chatId);
        if (!chat || chat.user_id !== userId) {
            console.log('Chat not found or unauthorized:', { chatId, userId });
            return res.status(404).json({ success: false, error: 'Chat not found' });
        }
        
        // Check if chat is completed or has error
        if (chat.is_completed || chat.has_error) {
            console.log('Chat is completed or has error, blocking message:', { 
                chatId, 
                isCompleted: chat.is_completed, 
                hasError: chat.has_error 
            });
            return res.status(400).json({ 
                success: false, 
                error: 'This chat is completed or has an error. Please start a new chat.' 
            });
        }
        
        // Save user message
        await messageQueries.create(chatId, message, true);
        console.log('User message saved to database');
        
        // Generate both title and clarifying questions in a single API call
        console.log('Generating title and clarifying questions...');
        const result = await OpenAIService.generateTitleAndQuestions(message);
        
        if (result.success) {
            const generatedTitle = result.title;
            const questions = result.questions;
            console.log('Generated title:', generatedTitle);
            console.log('Generated questions:', questions);
            
            // Update chat title
            await chatQueries.updateTitle(chatId, generatedTitle);
            console.log('Chat title updated in database');
            
            const responseText = `I'd like to help you refine your research topic. To provide you with the most relevant research guidance, I have a few clarifying questions:\n\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n\n')}\n\nPlease answer these questions one by one, and I'll create a comprehensive research plan for you.`;
            
            // Save AI response
            await messageQueries.create(chatId, responseText, false);
            console.log('AI response saved to database');
            
            res.json({ 
                success: true, 
                response: responseText,
                messageType: 'clarifying_questions',
                questions: questions,
                title: generatedTitle,
                user: req.session.username 
            });
        } else {
            console.log('Failed to generate title and questions, using fallback');
            const errorResponse = "I'm not able to find the answer right now. Please try again.";
            await messageQueries.create(chatId, errorResponse, false);
            
            // Mark chat as having an error
            await chatQueries.markAsError(chatId);
            console.log('Chat marked as error in database');
            
            res.json({ 
                success: true, 
                response: errorResponse,
                title: 'Research Topic...',
                user: req.session.username 
            });
        }
    } catch (error) {
        console.error('Research topic error:', error);
        res.status(500).json({ success: false, error: 'Failed to process research topic' });
    }
});

// Step 2: Process clarifying question answer
app.post("/api/chats/:chatId/clarification-answer", requireAuth, async (req, res) => {
    try {
        console.log('=== CLARIFICATION ANSWER ENDPOINT ===');
        const { chatId } = req.params;
        const { message, questionIndex, totalQuestions, originalTopic, questions, answers } = req.body;
        const userId = req.session.userId;
        
        console.log('Processing clarification answer:', { 
            chatId, userId, message, questionIndex, totalQuestions, originalTopic 
        });
        
        // Verify chat belongs to user
        const chat = await chatQueries.findById(chatId);
        if (!chat || chat.user_id !== userId) {
            console.log('Chat not found or unauthorized:', { chatId, userId });
            return res.status(404).json({ success: false, error: 'Chat not found' });
        }
        
        // Check if chat is completed or has error
        if (chat.is_completed || chat.has_error) {
            console.log('Chat is completed or has error, blocking message:', { 
                chatId, 
                isCompleted: chat.is_completed, 
                hasError: chat.has_error 
            });
            return res.status(400).json({ 
                success: false, 
                error: 'This chat is completed or has an error. Please start a new chat.' 
            });
        }
        
        // Save user message
        await messageQueries.create(chatId, message, true);
        console.log('User answer saved to database');
        
        // Check if this is the last question
        if (questionIndex >= totalQuestions - 1) {
            console.log('Last question answered, generating research page...');
            
            // Generate final research pages from OpenAI and Gemini (Gemini optional)
            let researchResult = { success: false }
            let geminiResult = { success: false }
            try {
                [researchResult, geminiResult] = await Promise.all([
                    OpenAIService.generateResearchPage(originalTopic, questions, answers),
                    GeminiService.generateResearchPage(originalTopic, questions, answers).catch((e) => {
                        console.error('Gemini generation failed:', e)
                        return { success: false }
                    })
                ])
            } catch (e) {
                console.error('Parallel research generation error:', e)
            }

            if (researchResult.success) {
                console.log('OpenAI research page generated successfully')
                const openaiLabeled = `## ChatGPT (OpenAI) Research\n\n${researchResult.researchPage}`
                const geminiLabeled = (geminiResult && geminiResult.success && geminiResult.researchPage)
                  ? `## Gemini (Google) Research\n\n${geminiResult.researchPage}`
                  : null

                // Save OpenAI first so ChatGPT appears before Gemini in the UI
                await messageQueries.create(chatId, openaiLabeled, false)
                // Save Gemini after OpenAI (if present)
                if (geminiLabeled) {
                    await messageQueries.create(chatId, geminiLabeled, false)
                }

                // Mark chat as completed after both saved
                await chatQueries.markAsCompleted(chatId)
                console.log('Chat marked as completed in database')

                // Return both sections so client can render immediately without refresh
                res.json({ 
                    success: true, 
                    messageType: 'research_pages',
                    openaiResearch: openaiLabeled,
                    geminiResearch: geminiLabeled,
                    user: req.session.username 
                })
            } else {
                console.log('Failed to generate research page, using error response');
                const errorResponse = "I'm not able to find the answer right now. Please try again.";
                await messageQueries.create(chatId, errorResponse, false);
                
                // Mark chat as having an error
                await chatQueries.markAsError(chatId);
                console.log('Chat marked as error in database');
                
                res.json({ 
                    success: true, 
                    response: errorResponse,
                    user: req.session.username 
                });
            }
        } else {
            console.log('More questions to answer, providing acknowledgment');
            // More questions to answer
            const responseText = `Thank you for your answer. Please answer the next question.`;
            await messageQueries.create(chatId, responseText, false);
            
            res.json({ 
                success: true, 
                response: responseText,
                messageType: 'acknowledgment',
                user: req.session.username 
            });
        }
    } catch (error) {
        console.error('Clarification answer error:', error);
        res.status(500).json({ success: false, error: 'Failed to process clarification answer' });
    }
});

// Legacy endpoint for backward compatibility
app.post("/api/chats/:chatId/messages", requireAuth, async (req, res) => {
    try {
        console.log('=== LEGACY MESSAGE ENDPOINT ===');
        const { chatId } = req.params;
        const { message, messageType = 'regular' } = req.body;
        const userId = req.session.userId;
        
        console.log('Legacy endpoint called:', { chatId, userId, message, messageType });
        
        // Verify chat belongs to user
        const chat = await chatQueries.findById(chatId);
        if (!chat || chat.user_id !== userId) {
            console.log('Chat not found or unauthorized:', { chatId, userId });
            return res.status(404).json({ success: false, error: 'Chat not found' });
        }
        
        // Save user message
        await messageQueries.create(chatId, message, true);
        console.log('User message saved to database');
        
        // For legacy compatibility, treat as research topic
        console.log('Treating as research topic for legacy compatibility');
        
        // Generate both title and clarifying questions in a single API call
        console.log('Generating title and clarifying questions...');
        const result = await OpenAIService.generateTitleAndQuestions(message);
        
        if (result.success) {
            const generatedTitle = result.title;
            const questions = result.questions;
            console.log('Generated title:', generatedTitle);
            console.log('Generated questions:', questions);
            
            // Update chat title
            await chatQueries.updateTitle(chatId, generatedTitle);
            console.log('Chat title updated in database');
            
            const responseText = `I'd like to help you refine your research topic. To provide you with the most relevant research guidance, I have a few clarifying questions:\n\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n\n')}\n\nPlease answer these questions one by one, and I'll create a comprehensive research plan for you.`;
            
            // Save AI response
            await messageQueries.create(chatId, responseText, false);
            console.log('AI response saved to database');
            
            res.json({ 
                success: true, 
                response: responseText,
                messageType: 'clarifying_questions',
                questions: questions,
                title: generatedTitle,
                user: req.session.username 
            });
        } else {
            console.log('Failed to generate title and questions, using error response');
            const errorResponse = "I'm not able to find the answer right now. Please try again.";
            await messageQueries.create(chatId, errorResponse, false);
            
            // Mark chat as having an error
            await chatQueries.markAsError(chatId);
            console.log('Chat marked as error in database');
            
            res.json({ 
                success: true, 
                response: errorResponse,
                title: 'Research Topic...',
                user: req.session.username 
            });
        }
    } catch (error) {
        console.error('Legacy message error:', error);
        res.status(500).json({ success: false, error: 'Failed to send message' });
    }
});

// Get user's daily chat count
app.get("/api/user/chat-count", requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId;
        const user = await userQueries.findById(userId);
        const todayCount = await dailyChatQueries.getTodayCount(userId);
        const maxChats = user.is_premium ? 20 : 5;
        
        res.json({ 
            success: true, 
            todayCount, 
            maxChats, 
            isPremium: user.is_premium 
        });
    } catch (error) {
        console.error('Get chat count error:', error);
        res.status(500).json({ success: false, error: 'Failed to get chat count' });
    }
});

// Email endpoint to send research report
app.post("/api/chats/:chatId/send-email", requireAuth, async (req, res) => {
    try {
        console.log('=== EMAIL ENDPOINT ===');
        const { chatId } = req.params;
        const userId = req.session.userId;
        
        // Verify chat belongs to user
        const chat = await chatQueries.findById(chatId);
        if (!chat || chat.user_id !== userId) {
            return res.status(404).json({ success: false, error: 'Chat not found' });
        }
        
        // Get user email
        const user = await userQueries.findById(userId);
        if (!user || !user.email) {
            return res.status(400).json({ success: false, error: 'User email not found' });
        }
        
        // Get all messages for the chat
        const messages = await messageQueries.findByChatId(chatId);
        if (!messages || messages.length === 0) {
            return res.status(400).json({ success: false, error: 'No messages found in chat' });
        }
        
        // Find labeled AI messages for ChatGPT and Gemini
        const aiMessages = messages.filter(msg => !msg.is_user)
        const openaiMsg = aiMessages.find(m => (m.content || '').startsWith('## ChatGPT (OpenAI) Research')) || aiMessages[0]
        const geminiMsg = aiMessages.find(m => (m.content || '').startsWith('## Gemini (Google) Research')) || null
        if (!openaiMsg) {
            return res.status(400).json({ success: false, error: 'No research report found' });
        }
        
        // Get the original topic (first user message)
        const originalTopic = messages
            .filter(msg => msg.is_user)
            .shift()?.content || 'Research Topic';
        
        console.log('=== Sending email ===', { 
            userEmail: user.email, 
            topic: originalTopic,
            reportLength: (openaiMsg?.content || '').length 
        });
        
        // Use already-generated contents when available; otherwise generate Gemini now
        const chatgptContent = openaiMsg.content
        let geminiContent = geminiMsg ? geminiMsg.content : ''
        if (!geminiContent) {
            try {
                const firstAi = aiMessages[0]?.content || ''
                const clarifyingQuestions = []
                if (firstAi) {
                    const matches = firstAi.split('\n').filter(l => /^\d+\.\s/.test(l)).map(l => l.replace(/^\d+\.\s/, ''))
                    if (matches.length) clarifyingQuestions.push(...matches)
                }
                const userAnswers = messages.filter(m => m.is_user).slice(1).map(m => m.content)
                const gemini = await GeminiService.generateResearchPage(originalTopic, clarifyingQuestions, userAnswers)
                if (gemini.success) {
                    geminiContent = `## Gemini (Google) Research\n\n${gemini.researchPage || ''}`
                }
            } catch (e) {
                console.error('Gemini generation failed, proceeding without Gemini section', e)
            }
        }
        const result = await sendCombinedResearchReportSendGrid(
            user.email,
            chatgptContent,
            geminiContent || '## Gemini (Google) Research\n\nNo Gemini content available.',
            originalTopic
        )

        console.log('=== Combined email sent successfully ===', result)

        res.json({ success: true, message: 'Research report sent successfully', messageId: result.messageId, summary: result.summary })
        
    } catch (error) {
        console.error('=== Email endpoint error ===', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to send research report',
            details: error.message 
        });
    }
});

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});