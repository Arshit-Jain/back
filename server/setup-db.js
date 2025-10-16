import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pool from './database/connection.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function setupDatabase() {
  try {
    console.log('Setting up database...')
    
    // Read and execute schema
    const schemaPath = path.join(__dirname, 'database', 'schema.sql')
    const schema = fs.readFileSync(schemaPath, 'utf8')
    
    // Split by semicolon and execute each statement
    const statements = schema.split(';').filter(stmt => stmt.trim())
    
    for (const statement of statements) {
      if (statement.trim()) {
        await pool.query(statement)
        console.log('✓ Executed:', statement.substring(0, 50) + '...')
      }
    }
    
    console.log('✅ Database setup completed successfully!')
    console.log('📊 Tables created:')
    console.log('  - users (with premium support)')
    console.log('  - chats (user chat history)')
    console.log('  - messages (chat messages)')
    console.log('  - user_daily_chats (daily limits)')
    console.log('')
    console.log('🔑 Default users created:')
    console.log('  - admin (premium) - password: admin123')
    console.log('  - user (free) - password: user123')
    console.log('')
    console.log('💡 Premium users: 20 chats/day')
    console.log('💡 Free users: 5 chats/day')
    
  } catch (error) {
    console.error('❌ Database setup failed:', error.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

setupDatabase()
