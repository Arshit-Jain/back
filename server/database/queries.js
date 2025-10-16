import pool from './connection.js'

// User queries
export const userQueries = {
  async findByUsername(username) {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username])
    return result.rows[0]
  },

  async findByEmail(email) {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email])
    return result.rows[0]
  },

  async findById(id) {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id])
    return result.rows[0]
  },

  async create(username, email, passwordHash, isPremium = false) {
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash, is_premium) VALUES ($1, $2, $3, $4) RETURNING *',
      [username, email, passwordHash, isPremium]
    )
    return result.rows[0]
  },

  async updateLastLogin(id) {
    await pool.query('UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id])
  }
}

// Chat queries
export const chatQueries = {
  async findByUserId(userId) {
    const result = await pool.query(
      'SELECT * FROM chats WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    )
    return result.rows
  },

  async findById(chatId) {
    const result = await pool.query('SELECT * FROM chats WHERE id = $1', [chatId])
    return result.rows[0]
  },

  async create(userId, title) {
    const result = await pool.query(
      'INSERT INTO chats (user_id, title) VALUES ($1, $2) RETURNING *',
      [userId, title]
    )
    return result.rows[0]
  },

  async updateTitle(chatId, title) {
    const result = await pool.query(
      'UPDATE chats SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [title, chatId]
    )
    return result.rows[0]
  },

  async markAsCompleted(chatId) {
    const result = await pool.query(
      'UPDATE chats SET is_completed = TRUE, has_error = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
      [chatId]
    )
    return result.rows[0]
  },

  async markAsError(chatId) {
    const result = await pool.query(
      'UPDATE chats SET has_error = TRUE, is_completed = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
      [chatId]
    )
    return result.rows[0]
  },

  async delete(chatId) {
    await pool.query('DELETE FROM chats WHERE id = $1', [chatId])
  }
}

// Message queries
export const messageQueries = {
  async findByChatId(chatId) {
    const result = await pool.query(
      'SELECT * FROM messages WHERE chat_id = $1 ORDER BY created_at ASC',
      [chatId]
    )
    return result.rows
  },

  async create(chatId, content, isUser) {
    const result = await pool.query(
      'INSERT INTO messages (chat_id, content, is_user) VALUES ($1, $2, $3) RETURNING *',
      [chatId, content, isUser]
    )
    return result.rows[0]
  },

  async deleteByChatId(chatId) {
    await pool.query('DELETE FROM messages WHERE chat_id = $1', [chatId])
  }
}

// Daily chat count queries
export const dailyChatQueries = {
  async getTodayCount(userId) {
    const today = new Date().toISOString().split('T')[0]
    const result = await pool.query(
      'SELECT chat_count FROM user_daily_chats WHERE user_id = $1 AND date = $2',
      [userId, today]
    )
    return result.rows[0]?.chat_count || 0
  },

  async incrementTodayCount(userId) {
    const today = new Date().toISOString().split('T')[0]
    const result = await pool.query(
      `INSERT INTO user_daily_chats (user_id, date, chat_count) 
       VALUES ($1, $2, 1) 
       ON CONFLICT (user_id, date) 
       DO UPDATE SET chat_count = user_daily_chats.chat_count + 1 
       RETURNING chat_count`,
      [userId, today]
    )
    return result.rows[0].chat_count
  },

  async canCreateChat(userId, isPremium) {
    const todayCount = await this.getTodayCount(userId)
    const maxChats = isPremium ? 20 : 5
    return todayCount < maxChats
  }
}
