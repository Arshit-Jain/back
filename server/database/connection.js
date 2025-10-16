import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

// Use Supabase connection string
const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('❌ Missing Supabase database URL (SUPABASE_DB_URL or DATABASE_URL)');
}

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false, // required for Supabase
  },
});

// Optional: test the connection once
(async () => {
  try {
    const client = await pool.connect();
    console.log('✅ Connected to Supabase PostgreSQL');
    client.release();
  } catch (err) {
    console.error('❌ Supabase connection error:', err);
  }
})();

export default pool;