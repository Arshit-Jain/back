import pkg from 'pg'
const { Pool } = pkg
import dotenv from 'dotenv'
import { setDefaultResultOrder } from 'dns'

dotenv.config()
// Respect DNS order (allows IPv6-first if provided by Supabase)
try { setDefaultResultOrder('verbatim') } catch (_) {}

// Use only connection string for Supabase
const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
if (!connectionString) {
  throw new Error('DATABASE_URL (or SUPABASE_DB_URL) is required')
}

const pool = new Pool({
  connectionString,
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