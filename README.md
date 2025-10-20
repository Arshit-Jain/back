# Backend

A Node.js backend API for a multiple AI providers (OpenAI, Gemini), user authentication, chat management, and email services.

## Features

- 🤖 **Multiple AI Providers**: OpenAI GPT and Google Gemini integration
- 🔐 **Authentication**: JWT-based auth with Google OAuth support
- 💬 **Chat Management**: Create, manage, and store chat conversations
- 📧 **Email Services**: SendGrid integration for email notifications
- 👤 **User Management**: Premium/free user tiers with daily chat limits
- 🗄️ **PostgreSQL Database**: Persistent storage for users, chats, and messages
- 🚀 **Production Ready**: Configured for deployment on Render

## Prerequisites

- Node.js (v16 or higher)
- PostgreSQL database
- API keys for:
  - OpenAI API
  - Google Gemini API
  - SendGrid (for email services)
  - Google OAuth (for authentication)

## Installation

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd bc/server
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Database Setup

#### Create PostgreSQL Database

```
CREATE DATABASE multi-api-research;
```

#### Configure Database Connection

Copy the environment template and configure your database settings:

```bash
cp env.example .env
```

Edit `.env` file with your database credentials:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=chatgpt_clone
DB_USER=your_postgres_user
DB_PASSWORD=your_postgres_password
```

### 4. Environment Configuration

Update the `.env` file with your API keys and configuration:

```env
# Session Secret (generate a secure random string)
SESSION_SECRET=your-secret-key-change-in-production

# Server Configuration
PORT=3000

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
FRONTEND_URL=http://localhost:5173

# OpenAI Configuration
OPENAI_API_KEY=your-openai-api-key

# Gemini Configuration
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash

# SendGrid Email Configuration
SENDGRID_API_KEY=your-sendgrid-api-key
FROM_EMAIL=noreply@yourdomain.com

# JWT Secret
JWT_SECRET=your-jwt-secret-key
```

### 5. Initialize Database

Run the database setup script to create tables and insert default data:

```bash
npm run setup-db
```

This will create:
- `users` table with premium support
- `chats` table for chat history
- `messages` table for chat messages
- `user_daily_chats` table for daily limits
- Default users (admin/user with passwords admin123/user123)

## Running the Application

### Development Mode

```bash
npm start
```

The server will start on `http://localhost:3000` (or the port specified in your `.env` file).

### Production Mode

```bash
node index.js
```

## API Endpoints

### Health Check
- `GET /` - Health check endpoint

### Authentication
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `GET /auth/google` - Google OAuth login
- `GET /auth/google/callback` - Google OAuth callback
- `POST /auth/logout` - User logout

### Chat Management
- `GET /api/chats` - Get user's chats
- `POST /api/chats` - Create new chat
- `GET /api/chats/:id` - Get specific chat
- `POST /api/chats/:id/messages` - Send message to chat

### User Management
- `GET /api/user/profile` - Get user profile
- `PUT /api/user/profile` - Update user profile

### Email Services
- `POST /api/chats/send-email` - Send chat via email

## Default Users

The setup script creates two default users:

- **Admin User** (Premium)
  - Username: `admin`
  - Email: `admin@example.com`
  - Password: `admin123`
  - Daily limit: 20 chats

- **Regular User** (Free)
  - Username: `user`
  - Email: `user@example.com`
  - Password: `user123`
  - Daily limit: 5 chats

## User Tiers

- **Free Users**: 5 chats per day
- **Premium Users**: 20 chats per day

## Deployment

### Render Deployment

The project includes a `render.yaml` configuration file for easy deployment on Render:

1. Connect your GitHub repository to Render
2. Set the required environment variables in Render dashboard
3. Deploy using the provided configuration

### Environment Variables for Production

Make sure to set these environment variables in your production environment:

- `NODE_ENV=production`
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `SESSION_SECRET` (generate a secure random string)
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `SENDGRID_API_KEY`, `FROM_EMAIL`
- `FRONTEND_URL` (your frontend domain)
- `JWT_SECRET`

## Project Structure

```
server/
├── config/
│   ├── constants.js
│   └── passport.js
├── database/
│   ├── connection.js
│   ├── queries.js
│   └── schema.sql
├── middleware/
│   └── auth.js
├── routes/
│   ├── auth.js
│   ├── chats.js
│   ├── email.js
│   ├── health.js
│   └── user.js
├── services/
│   ├── emailService.js
│   ├── gemini.js
│   └── openai.js
├── index.js
├── setup-db.js
├── package.json
└── render.yaml
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test your changes
5. Submit a pull request

## License

ISC License
