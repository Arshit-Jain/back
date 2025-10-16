import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

// Use Supabase connection string
const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ Missing Supabase database URL (SUPABASE_DB_URL or DATABASE_URL)');
  throw new Error('Missing Supabase database URL');
}

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false, // required for Supabase
  },
  // Add connection pool settings
  max: 20, // maximum number of clients
  idleTimeoutMillis: 30000, // close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // return an error after 10 seconds if connection could not be established
});

// Test the connection on startup
pool.on('connect', () => {
  console.log('✅ Database client connected');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
});

// Optional: Test connection immediately
(async () => {
  try {
    const client = await pool.connect();
    console.log('✅ Database connection test successful');
    client.release();
  } catch (err) {
    console.error('❌ Database connection test failed:', err.message);
    console.error('Please check your connection string and ensure:');
    console.error('1. SUPABASE_DB_URL or DATABASE_URL is set in .env');
    console.error('2. The connection string is correct');
    console.error('3. Your Supabase project is active');
    console.error('4. Your IP is allowed in Supabase settings');
  }
})();

export default pool;