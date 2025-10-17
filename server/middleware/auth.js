// server/middleware/auth.js
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-jwt-secret-change-in-production";

/**
 * Middleware to verify and decode JWT tokens
 * Supports multiple token sources:
 * - Authorization header (Bearer token)
 * - Query parameter (?token=...)
 * - Request body (token field)
 */
export const authenticateJWT = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let token = null;

    // Check Authorization header
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }
    // Fallback to query parameter
    else if (req.query && req.query.token) {
      token = req.query.token;
    }
    // Fallback to request body
    else if (req.body && req.body.token) {
      token = req.body.token;
    }

    if (!token) {
      return res.status(401).json({ error: "Authentication required", redirect: "/login" });
    }

    // Verify and decode token
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // Attach decoded user info to request
    next();
  } catch (error) {
    console.error("JWT verification failed:", error?.message || error);
    return res.status(401).json({ error: "Invalid or expired token", redirect: "/login" });
  }
};

export default authenticateJWT;