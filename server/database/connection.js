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

const client = await pool.connect();


export default pool;