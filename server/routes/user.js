// server/routes/user.js
import express from "express";
import { userQueries, dailyChatQueries } from "../database/queries.js";

const router = express.Router();

// ===== Get user chat count and limits =====
router.get("/chat-count", async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await userQueries.findById(userId);

    if (!user) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

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

// ===== Get user profile =====
router.get("/profile", async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await userQueries.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        is_premium: user.is_premium,
        created_at: user.created_at,
        last_login: user.last_login,
      },
    });
  } catch (error) {
    console.error("Get user profile error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch user profile" });
  }
});

export default router;