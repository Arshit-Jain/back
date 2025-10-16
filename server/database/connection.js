import pkg from 'pg'
const { Pool } = pkg
import dotenv from 'dotenv'

dotenv.config()

// For Supabase, you can use either individual connection parameters or a connection string
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL,
  // Fallback to individual parameters if connection string is not provided
  user: process.env.DB_USER || process.env.SUPABASE_DB_USER,
  host: process.env.DB_HOST || process.env.SUPABASE_DB_HOST,
  database: process.env.DB_NAME || process.env.SUPABASE_DB_NAME,
  password: process.env.DB_PASSWORD || process.env.SUPABASE_DB_PASSWORD,
  port: process.env.DB_PORT || process.env.SUPABASE_DB_PORT || 5432,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

// Test connection
pool.on('connect', () => {
  console.log('Connected to database')
})

pool.on('error', (err) => {
  console.error('Database connection error:', err)
})

export default pool