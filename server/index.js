Arshit-Jain/Multi-API-Research
main

GITHUB

How would I deploy this through vercel?

I'll help you deploy this application to Vercel. However, there are some important considerations since your app has both a client (React/Vite) and a server (Express/Node.js) with a PostgreSQL database.

Deployment Strategy
Vercel is primarily designed for frontend applications and serverless functions. Here's the recommended approach:

Option 1: Deploy Frontend to Vercel + Backend Elsewhere (Recommended)
Frontend (Vercel):

Deploy the React client to Vercel
Configure environment variables for API endpoints
Backend (Render/Railway/Heroku):

Deploy the Express server to a platform that supports long-running Node.js processes
Use a managed PostgreSQL service (like Supabase, Neon, or Railway's database)
Option 2: Adapt Backend to Vercel Serverless Functions (More Complex)
Convert your Express routes to Vercel serverless functions. This requires significant refactoring.

Deployment Guide - Option 1 (Recommended)
Vercel Deployment Guide
Code 
I've created a comprehensive deployment guide for your application. Here's a summary of the approach:

Quick Deployment Steps:
1. Frontend (Vercel) ✅
Deploy your React/Vite client
Free hosting with automatic deployments
CDN and HTTPS included
2. Backend (Render/Railway) 🚀
Deploy your Express server
Use a managed PostgreSQL database
Free tier available for testing
3. Key Changes Needed:
Client (client/src/services/api.js):

javascript
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'
Server (server/index.js):

javascript
app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true
}));
Why Not Serverless?
Your Express backend with long-running processes, PostgreSQL connections, and session management isn't ideal for Vercel's serverless functions. Using Render or Railway for the backend provides:

Persistent connections
Session management
Background processes
Better database handling
Quick Start:
Push code to GitHub
Deploy frontend to Vercel (point to client directory)
Deploy backend to Render (point to server directory)
Set up PostgreSQL database (Supabase/Neon)
Configure environment variables on both platforms
Update Google OAuth redirects
Would you like me to create specific configuration files for any of these platforms, or help with a different deployment strategy?


You can’t sign in because Multi API Research sent an invalid request. You can try again later, or contact the developer about this issue. Learn more about this error
If you are a developer of Multi API Research, see error details.
Error 400: redirect_uri_mismatch

Error 400: redirect_uri_mismatch
You can't sign in to this app because it doesn't comply with Google's OAuth 2.0 policy. If you're the app developer, register the redirect URI in the Google Cloud Console.
Request details: redirect_uri=http://back-multi-api.onrender.com/auth/google/callback flowName=GeneralOAuthFlow

This error occurs because the redirect URI in your Google OAuth configuration doesn't match what you've registered in Google Cloud Console. Let me help you fix this:

Fix Google OAuth redirect_uri_mismatch
Code 
Quick Fix (3 Steps):
1. Add to Google Cloud Console ⚡
Go to Google Cloud Console → APIs & Services → Credentials → Edit your OAuth Client

Add these Authorized redirect URIs:

https://back-multi-api.onrender.com/auth/google/callback
http://back-multi-api.onrender.com/auth/google/callback
2. Update server/index.js 🔧
Add proxy: true to your Google Strategy:

javascript
passport.use(new GoogleStrategy.Strategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback",
    proxy: true  // ⚠️ ADD THIS LINE
}, async (accessToken, refreshToken, profile, done) => {
    // ... your existing code
}));
3. Redeploy on Render 🚀
bash
git add .
git commit -m "Fix Google OAuth proxy settings"
git push origin main
The key issue is that Render uses HTTPS but your app might be sending HTTP in the redirect URI. Adding proxy: true tells Passport.js to trust the proxy headers and use the correct HTTPS protocol.

Try these changes and let me know if you still get the error!


Access blocked: back-multi-api.onrender.com’s request is invalid
arshit.0303@gmail.com
You can’t sign in because back-multi-api.onrender.com sent an invalid request. You can try again later, or contact the developer about this issue. Learn more about this error
If you are a developer of back-multi-api.onrender.com, see error details.
Error 400: redirect_uri_mismatch

You can't sign in to this app because it doesn't comply with Google's OAuth 2.0 policy. If you're the app developer, register the redirect URI in the Google Cloud Console.
Request details: access_type=online scope=https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email openid response_type=code redirect_uri=http://back-multi-api.onrender.com/auth/google/callback flowName=GeneralOAuthFlow client_id=1010824844525-pnvq0u1p8vc5mg2if27rqp0odrl3vbvm.apps.googleusercontent.com

The error shows it's still using http:// instead of https://. The issue is that even with proxy: true, the callback URL is being constructed as HTTP. Let me help you fix this properly:

Fix Google OAuth redirect_uri_mismatch
Code ∙ Version 2 
Immediate Fix: Use Full HTTPS URL
Update your server/index.js with the full HTTPS callback URL:

javascript
// At the top with other imports
import dotenv from 'dotenv';
dotenv.config();

// ... other code ...

// Passport Google Strategy - Use FULL HTTPS URL
passport.use(new GoogleStrategy.Strategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "https://back-multi-api.onrender.com/auth/google/callback", // ✅ FULL URL
    proxy: true
}, async (accessToken, refreshToken, profile, done) => {
    // ... your existing code
}));
Better Solution: Use Environment Variable
Update server/.env (and Render environment variables):

env
BACKEND_URL=https://back-multi-api.onrender.com
GOOGLE_CLIENT_ID=1010824844525-pnvq0u1p8vc5mg2if27rqp0odrl3vbvm.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-secret-here
FRONTEND_URL=https://your-app.vercel.app
Then update server/index.js:

javascript
passport.use(new GoogleStrategy.Strategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.BACKEND_URL}/auth/google/callback`, // ✅ Dynamic
    proxy: true
}, async (accessToken, refreshToken, profile, done) => {
    // ... your existing code
}));
```

## Add to Google Cloud Console

**CRITICAL:** Add this EXACT URL to Google Cloud Console:
```
https://back-multi-api.onrender.com/auth/google/callback
```

Steps:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. APIs & Services → Credentials
3. Click on your OAuth 2.0 Client ID: `1010824844525-pnvq0u1p8vc5mg2if27rqp0odrl3vbvm`
4. Under **Authorized redirect URIs**, add:
```
   https://back-multi-api.onrender.com/auth/google/callback
```
5. Also add for local testing:
```
   http://localhost:3000/auth/google/callback
```
6. Click **SAVE**

## Add Environment Variable to Render

1. Go to your Render dashboard
2. Select your service
3. Go to **Environment** tab
4. Add:
```
   BACKEND_URL = https://back-multi-api.onrender.com
```
5. Save changes (will trigger redeploy)

## Quick Test

After updating and redeploying, test by visiting:
```
https://back-multi-api.onrender.com/auth/google
It should redirect you to Google's login page, and after login, redirect back to your frontend.

The key issue: Render provides HTTPS but the callback URL was being constructed as HTTP. Using the full HTTPS URL or environment variable with HTTPS fixes this.

Try this and let me know if it works!


Internal Server Error

on this link: https://back-multi-api.onrender.com/auth/google/callback?code=4%2F0AVGzR1ADIT_MNRGqKDA0A-GIap92XzCPGFxxDFSt-nIfD56wM7e_wC1tMY9RN2isu7W9Mw&scope=email+profile+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.email+openid+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.profile&authuser=0&prompt=none
Great progress! Google OAuth is working now, but there's an error in your callback handler. Let's check the Render logs to see what's happening.

Fix OAuth Callback Internal Server Error
Code 
Now let's check what's causing the error. Here's what you need to do:

1. Check Render Logs (IMPORTANT) 🔍
Go to your Render Dashboard
Click on your back-multi-api service
Click on Logs tab
Look for error messages around the time you tried to login
Look for errors like:

Database connection errors
Missing environment variables
"Cannot read property..." errors
SQL errors
2. Verify Environment Variables on Render ⚙️
Make sure these are all set in Render:

bash
# Database
DB_HOST=your-database-host
DB_PORT=5432
DB_NAME=your-database-name
DB_USER=your-database-user
DB_PASSWORD=your-database-password

# OAuth
GOOGLE_CLIENT_ID=1010824844525-pnvq0u1p8vc5mg2if27rqp0odrl3vbvm.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-secret
BACKEND_URL=https://back-multi-api.onrender.com
FRONTEND_URL=https://your-app.vercel.app

# Session
SESSION_SECRET=some-random-secret-string
NODE_ENV=production
3. Update Your Code
Replace the Google OAuth section in server/index.js with the code from the artifact above. Key changes:

Better error handling in OAuth callback
Explicit session save before redirect
Error logging to help debug
Health check endpoints for testing
4. Quick Database Test 🗄️
Add this test endpoint to check if database is working:

javascript
app.get("/test-db", async (req, res) => {
    try {
        const pool = (await import('./database/connection.js')).default;
        await pool.query('SELECT 1');
        res.json({ success: true, message: "Database connected" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
Then visit: https://back-multi-api.onrender.com/test-db

5. Common Causes & Solutions
Most Likely Issue: Database Connection
Check if your database is configured:

bash
# In Render logs, look for:
"Error connecting to database"
"Connection refused"
"ECONNREFUSED"
Solution: Make sure your PostgreSQL database is:

Created and running (Supabase/Neon/Railway)
Connection string is correct in environment variables
Schema is set up (run schema.sql)
Issue: Session Cookie Problem
Check:

javascript
cookie: {
    secure: true, // Must be true for HTTPS
    sameSite: 'none' // Required for cross-origin
}
6. Test Locally First 🧪
bash
cd server

# Set environment variables
export GOOGLE_CLIENT_ID=your-id
export GOOGLE_CLIENT_SECRET=your-secret
export FRONTEND_URL=http://localhost:5173
export BACKEND_URL=http://localhost:3000

# Start server
npm start

# Test OAuth
# Open: http://localhost:3000/auth/google
Can You Share the Error?
Please check Render logs and share:

The exact error message
The stack trace if available
Any database connection errors
This will help me give you a more specific fix!



index.js
783 lines

js

https://back-multi-api.onrender.com/auth/google/callback?code=4%2F0AVGzR1B7yf2A8gafa6b8eO1UcVuuXIclg9FvHw2gCTyZdiI7K9drF8TzSRKx-8hX_BNsmA&scope=email+profile+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.email+openid+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.profile&authuser=0&prompt=none

same error

The issue is with your session configuration for production. You need to update the cookie settings for cross-origin requests. Here's the fix:

Fix OAuth Callback Internal Server Error
Code ∙ Version 2 
Now update your server/index.js file:

Quick Fix - Update Session Configuration
Replace the session configuration section (around line 24-33) with:

javascript
// Session configuration - FIXED for production
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // true for HTTPS
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // CRITICAL
        domain: process.env.NODE_ENV === 'production' ? '.onrender.com' : undefined
    },
    proxy: true // Trust the first proxy
}));
```

## Add Environment Variable to Render

1. Go to your Render dashboard
2. Click on your service
3. Go to **Environment** tab
4. Add:
```
   NODE_ENV=production
Save (will trigger redeploy)
Alternative Simpler Fix (If Above Doesn't Work)
If the session is still not working, try this simpler approach:

javascript
// Session configuration - Simplified for Render
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: true, // Always true on Render (HTTPS)
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'none' // Required for cross-origin
    },
    proxy: true
}));
Check Render Logs
After redeploying, visit the callback URL again and check the Render logs for:

bash
# Should see these logs:
Google callback received
OAuth successful, user: [user-id]
Session saved, redirecting to frontend
If Still Getting Error
The error might be in the database connection. Add this debug endpoint to check:

javascript
// Add before your other routes
app.get("/debug/session", (req, res) => {
    res.json({
        hasSession: !!req.session,
        sessionId: req.sessionID,
        userId: req.session?.userId,
        isAuthenticated: !!req.session?.userId
    });
});
Then test:

Visit: https://back-multi-api.onrender.com/debug/session
Try OAuth again
Visit debug endpoint again to see if session persisted
Which specific error message are you seeing in the Render logs? That will help me pinpoint the exact issue.


give me whole index file

Complete index.js with OAuth Fix
Code 


Session limit reached ∙ resets 6:00 PM
Upgrade





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

// Session configuration - FIXED for production
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // true for HTTPS in production
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // CRITICAL for cross-origin
    },
    proxy: true // Trust first proxy (Render)
}));

// Initialize passport, must be after session middleware
app.use(passport.initialize());
app.use(passport.session());

// Serialize user (via ID)
passport.serializeUser((user, done) => {
    console.log('Serializing user:', user.id);
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        console.log('Deserializing user:', id);
        const user = await userQueries.findById(id);
        done(null, user);
    } catch (e) {
        console.error('Error deserializing user:', e);
        done(e);
    }
});

// Passport Google Strategy
passport.use(new GoogleStrategy.Strategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.BACKEND_URL || 'http://localhost:3000'}/auth/google/callback`,
    proxy: true
}, async (accessToken, refreshToken, profile, done) => {
    try {
        console.log('Google OAuth callback - Profile:', {
            id: profile.id,
            email: profile.emails?.[0]?.value,
            displayName: profile.displayName
        });

        // Check if email exists
        if (!profile.emails || !profile.emails[0]) {
            console.error('No email in Google profile');
            return done(new Error('No email provided by Google'), null);
        }

        const email = profile.emails[0].value;

        // Check if user exists
        let user = await userQueries.findByEmail(email);
        
        if (!user) {
            console.log('Creating new user for email:', email);
            
            // Generate unique username
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

            console.log('Generated username:', uniqueUsername);

            user = await userQueries.create(
                uniqueUsername,
                email,
                "google-oauth",
                false
            );

            console.log('User created successfully:', user.id);
        } else {
            console.log('User already exists:', user.id);
        }

        return done(null, user);
    } catch (err) {
        console.error('Error in Google OAuth strategy:', err);
        return done(err, null);
    }
}));

// Auth endpoint for Google
app.get("/auth/google", (req, res, next) => {
    console.log('Initiating Google OAuth');
    passport.authenticate("google", { 
        scope: ["profile", "email"] 
    })(req, res, next);
});

// Google callback - UPDATED with better error handling
app.get("/auth/google/callback", 
    (req, res, next) => {
        console.log('Google callback received');
        passport.authenticate("google", {
            failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=oauth_failed`,
            session: true,
        })(req, res, next);
    },
    (req, res) => {
        try {
            console.log('OAuth successful, user:', req.user?.id);
            
            // Set session data
            req.session.userId = req.user.id;
            req.session.username = req.user.username;
            
            // Save session before redirect
            req.session.save((err) => {
                if (err) {
                    console.error('Session save error:', err);
                    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=session_failed`);
                }
                
                console.log('Session saved, redirecting to frontend');
                const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
                res.redirect(frontendUrl);
            });
        } catch (error) {
            console.error('Error in OAuth callback:', error);
            res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=callback_failed`);
        }
    }
);

// Authentication middleware
const requireAuth = (req, res, next) => {
    if (req.session.userId) {
        next();
    } else {
        res.status(401).json({ error: 'Authentication required', redirect: '/login' });
    }
};

// Health check endpoint
app.get("/health", (req, res) => {
    res.json({ 
        status: "ok", 
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Debug session endpoint
app.get("/debug/session", (req, res) => {
    res.json({
        hasSession: !!req.session,
        sessionId: req.sessionID,
        userId: req.session?.userId,
        isAuthenticated: !!req.session?.userId,
        cookie: req.session?.cookie
    });
});

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