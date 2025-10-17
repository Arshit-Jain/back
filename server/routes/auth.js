// server/routes/auth.js
import express from "express";
import passport from "passport";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { userQueries } from "../database/queries.js";
import { authenticateJWT } from "../middleware/auth.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "your-jwt-secret-change-in-production";
const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");
const BACKEND_URL = (process.env.BACKEND_URL || "http://localhost:3000").replace(/\/+$/, "");

// ===== Google OAuth Routes =====
router.get("/google", passport.authenticate("google", { scope: ["profile", "email"], session: false }));

router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${FRONTEND_URL}/login?error=oauth_failed`,
  }),
  (req, res) => {
    try {
      if (!req.user) {
        console.error("=== OAuth Callback: No user in req ===");
        return res.redirect(`${FRONTEND_URL}/login?error=no_user`);
      }

      const user = req.user;
      console.log("=== OAuth Callback: User authenticated ===", { userId: user.id, username: user.username });

      const tokenPayload = {
        id: user.id,
        username: user.username,
        email: user.email,
        is_premium: user.is_premium || false,
      };

      const jwtToken = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: "7d" });

      const redirectUrl = `${FRONTEND_URL}/login?token=${encodeURIComponent(jwtToken)}&oauth=success`;
      console.log("=== OAuth success, redirecting ===", { redirectUrl: redirectUrl.substring(0, 100) + "..." });

      return res.redirect(redirectUrl);
    } catch (err) {
      console.error("OAuth callback handler error:", err);
      return res.redirect(`${FRONTEND_URL}/login?error=server_error`);
    }
  }
);

// ===== JWT Email/Password Routes =====
router.post("/register", async (req, res) => {
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

router.post("/login", async (req, res) => {
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

// ===== OAuth Complete (Token Exchange) =====
router.post("/oauth-complete", async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      console.error("=== OAuth Complete: No token provided ===");
      return res.status(400).json({ success: false, error: "No token provided" });
    }

    console.log("=== OAuth Complete: Verifying token ===");

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
      console.log("=== OAuth Complete: Token verified ===", { userId: decoded.id });
    } catch (verifyError) {
      console.error("=== OAuth Complete: Token verification failed ===", verifyError.message);
      return res.status(401).json({ success: false, error: "Invalid or expired token" });
    }

    const user = await userQueries.findById(decoded.id);

    if (!user) {
      console.error("=== OAuth Complete: User not found ===", { userId: decoded.id });
      return res.status(404).json({ success: false, error: "User not found" });
    }

    console.log("=== OAuth Complete: User verified ===", { userId: user.id });

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        is_premium: user.is_premium || false,
      },
    });
  } catch (error) {
    console.error("=== OAuth Complete: Unexpected error ===", error.message);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

// ===== Auth Status (requires JWT) =====
router.get("/status", authenticateJWT, async (req, res) => {
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

export default router;