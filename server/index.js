// server/index.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import passport from "passport";

// Route imports
import authRoutes from "./routes/auth.js";
import chatRoutes from "./routes/chats.js";
import emailRoutes from "./routes/email.js";
import healthRoutes from "./routes/health.js";
import userRoutes from "./routes/user.js";

// Middleware imports
import { authenticateJWT } from "./middleware/auth.js";

// Services & config
import { configurePassport } from "./config/passport.js";

dotenv.config();

const app = express();

// ===== CORS Configuration =====
const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");
const BACKEND_URL = (process.env.BACKEND_URL || "http://localhost:3000").replace(/\/+$/, "");

app.set("trust proxy", 1);

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

// ===== Passport Setup =====
configurePassport(passport, BACKEND_URL);
app.use(passport.initialize());

// ===== Health Check Routes =====
app.use("/", healthRoutes);

// ===== Authentication Routes (Auth + OAuth) =====
app.use("/auth", authRoutes);
app.use("/api/auth", authRoutes);

// ===== Protected Routes =====
app.use("/api/chats", authenticateJWT, chatRoutes);
app.use("/api/chats", authenticateJWT, emailRoutes);
app.use("/api/user", authenticateJWT, userRoutes);

router.post("api/logout", (req, res) => {
  try {
    res.clearCookie("jwt", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    });

    // Respond with success
    return res.status(200).json({ message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout error:", err);
    return res.status(500).json({ message: "Logout failed" });
  }
});

// ===== Start Server =====
app._router.stack
  .filter(r => r.route)
  .forEach(r => console.log("Route:", r.route.path));

console.log("✅ Routes registered successfully");

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server (JWT-only) is running on port ${PORT}`);
});