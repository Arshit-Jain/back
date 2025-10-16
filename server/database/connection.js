import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

// Use either DATABASE_URL or SUPABASE_DB_URL
const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!connectionString) {
  console.error('❌ Missing database connection string');
  console.error('Please set either DATABASE_URL or SUPABASE_DB_URL in your .env file');
  throw new Error('Missing database connection string');
}

console.log('🔍 Connection string hostname:', connectionString.split('@')[1]?.split(':')[0] || 'unknown');

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false, // Required for Supabase
  },
  // Connection pool settings
  max: 20, // Maximum number of clients
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return error after 10 seconds if connection fails
});

// Event handlers
pool.on('connect', () => {
  console.log('✅ Database client connected');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err.message);
});

// Test connection on startup
(async () => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW(), version()');
    console.log('✅ Database connection test successful');
    console.log('📊 PostgreSQL version:', result.rows[0].version.split(',')[0]);
    console.log('🕐 Server time:', result.rows[0].now);
    client.release();
  } catch (err) {
    console.error('❌ Database connection test failed:', err.message);
    console.error('📋 Connection details:');
    console.error('   - Using:', process.env.DATABASE_URL ? 'DATABASE_URL' : 'SUPABASE_DB_URL');
    console.error('   - Host preview:', connectionString.substring(0, 50) + '...');
    if (err.code) {
      console.error('   - Error code:', err.code);
    }
  }
})();

export default pool;