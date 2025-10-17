// server/config/passport.js
import GoogleStrategy from "passport-google-oauth20";
import { userQueries } from "../database/queries.js";

/**
 * Configure Passport with Google OAuth Strategy
 * No sessions are used - JWT tokens are issued instead
 */
export const configurePassport = (passport, BACKEND_URL) => {
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
            // New user - generate unique username
            const uniqueUsername = await generateUniqueUsername(
              profile.displayName || email.split("@")[0],
              profile.id
            );

            user = await userQueries.create(uniqueUsername, email, "google-oauth", false);
            console.log("User created successfully:", user.id);
          } else {
            console.log("User already exists:", user.id);
          }

          done(null, user);
        } catch (err) {
          console.error("Google Strategy error:", err);
          done(err);
        }
      }
    )
  );
};

/**
 * Convert display name to base username format
 */
const toBaseUsername = (name) => {
  const raw = (name || "").toString().toLowerCase();
  const sanitized = raw
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
  return sanitized || `user_${(name || "").toString().slice(0, 6)}`;
};

/**
 * Generate a unique username for new OAuth users
 * Tries base_suffix format, falls back to base_timestamp
 */
const generateUniqueUsername = async (baseFromDisplay, profileId) => {
  const baseFromEmail = baseFromDisplay.split("@")[0];
  const base = toBaseUsername(baseFromDisplay || baseFromEmail || profileId);

  // Try random suffix approach first
  for (let i = 0; i < 10; i++) {
    const suffix = Math.random().toString().slice(2, 8);
    const candidate = `${base}_${suffix}`;
    const exists = await userQueries.findByUsername(candidate);
    if (!exists) return candidate;
  }

  // Fallback to timestamp-based suffix
  return `${base}_${Date.now().toString().slice(-6)}`;
};

export default configurePassport;