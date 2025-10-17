// server/config/constants.js

/**
 * Normalize URLs by removing trailing slashes
 */
export const normalizeUrl = (url) => (url || "").replace(/\/+$/, "");

/**
 * Environment configuration
 */
export const getEnvConfig = () => {
  const FRONTEND_URL = normalizeUrl(process.env.FRONTEND_URL || "http://localhost:5173");
  const BACKEND_URL = normalizeUrl(process.env.BACKEND_URL || "http://localhost:3000");
  const JWT_SECRET = process.env.JWT_SECRET || "your-jwt-secret-change-in-production";
  const PORT = process.env.PORT || 3000;

  return {
    FRONTEND_URL,
    BACKEND_URL,
    JWT_SECRET,
    PORT,
    NODE_ENV: process.env.NODE_ENV || "development",
  };
};

/**
 * CORS configuration
 */
export const getCorsConfig = (frontendUrl) => ({
  origin: frontendUrl,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

/**
 * Chat limits based on premium status
 */
export const CHAT_LIMITS = {
  free: 5,
  premium: 20,
};

export const getChatLimit = (isPremium) => isPremium ? CHAT_LIMITS.premium : CHAT_LIMITS.free;

export default {
  normalizeUrl,
  getEnvConfig,
  getCorsConfig,
  CHAT_LIMITS,
  getChatLimit,
};