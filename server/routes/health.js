// server/routes/health.js
import express from "express";
import jwt from "jsonwebtoken";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "your-jwt-secret-change-in-production";

// ===== Health check endpoint =====
router.get("/test", (req, res) => {
  res.json({ message: "Server is working", timestamp: new Date().toISOString() });
});

// ===== Health status endpoint =====
router.get("/health", (req, res) => {
  res.json({ status: "ok", ts: Date.now(), env: process.env.NODE_ENV || "development" });
});

// ===== Debug session endpoint (shows decoded JWT if provided) =====
router.get("/debug/session", (req, res) => {
  const authHeader = req.headers.authorization;
  let token = null;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

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

export default router;