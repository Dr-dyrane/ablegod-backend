# AbleGod Backend

A comprehensive Node.js backend API for the AbleGod blog platform with real-time features, analytics integration, and email notifications.

## 🚀 Features

- **Blog Management**: Full CRUD operations for blog posts, categories, and users
- **Real-time Notifications**: WebSocket support using Socket.IO
- **Email System**: Automated newsletter and welcome emails
- **Analytics Integration**: Google Analytics 4 (GA4) data fetching
- **Subscriber Management**: Newsletter subscription system
- **Authentication**: User login system
- **Real-time Analytics**: Currently online users tracking

## 📋 Table of Contents

- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [API Endpoints](#api-endpoints)
- [Models](#models)
- [Email System](#email-system)
- [Real-time Features](#real-time-features)
- [Analytics](#analytics)
- [Deployment](#deployment)

## 🛠 Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Set up environment variables (see [Environment Variables](#environment-variables))
4. Start the server:
```bash
npm start
```

The server will run on port 3001 by default.

## 🔧 Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Database
MONGODB_URI=your_mongodb_connection_string

# Email Configuration
GMAIL_USER=your_gmail_address
GMAIL_APP_PASSWORD=your_gmail_app_password

# Google Analytics
GOOGLE_SERVICE_ACCOUNT_BASE64=your_base64_encoded_service_account_json
GA4_PROPERTY_ID=your_ga4_property_id

# Server
PORT=3001
```

## 📡 API Endpoints

### Blog Posts (`/api/posts`)
- `GET /` - Get all blog posts
- `POST /` - Create new blog post (triggers newsletter emails)
- `GET /subcategory/:subcategory` - Get posts by subcategory
- `GET /tags/:tag` - Get posts by tag
- `GET /tags` - Get all distinct tags
- `PUT /:id` - Update blog post
- `DELETE /:id` - Delete blog post
- `POST /:id/like` - Like a post
- `DELETE /:id/like` - Unlike a post
- `POST /:id/comments` - Add comment to post
- `GET /:id/comments` - Get post comments

### Users (`/api/users`)
- `GET /` - Get all users
- `POST /` - Create new user
- `PUT /:id` - Update user
- `DELETE /:id` - Delete user

### Categories (`/api/categories`)
- `GET /` - Get all categories
- `POST /` - Create new category
- `PUT /:id` - Update category
- `DELETE /:id` - Delete category

### Subscribers (`/api/subscribers`)
- `GET /` - Get all subscribers
- `POST /` - Add new subscriber (sends welcome email)
- `PUT /:id` - Update subscriber status
- `DELETE /:id` - Delete subscriber

### Authentication (`/api`)
- `POST /login` - User login

### Analytics (`/api`)
- `GET /analytics?range=7d` - Get GA4 analytics data
  - Range options: `7d`, `14d`, `1m`, `3m`, `6m`, `all`
- `GET /currently-online` - Get real-time active users

### Notifications (`/api`)
- `POST /notifications` - Send notification to all or specific user

## 🗄 Models

### BlogPost
```javascript
{
  id: Number,
  title: String,
  excerpt: String,
  content: String,
  category: String,
  subcategory: String,
  date: String,
  readTime: String,
  comments: [{ id, text, author, date }],
  image: String,
  author: String,
  status: String,
  likes: Number,
  tags: [String]
}
```

### User
```javascript
{
  id: Number,
  username: String,
  name: String,
  email: String,
  role: String,
  status: String,
  password: String,
  createdAt: String,
  lastLogin: String,
  activities: [{ id, type, timestamp, details }]
}
```

### Subscriber
```javascript
{
  id: Number,
  email: String,
  name: String,
  status: String, // 'active' or 'inactive'
  subscribedAt: Date
}
```

### Category
```javascript
{
  id: String,
  name: String
}
```

## 📧 Email System

The backend includes an automated email system using Nodemailer and React Email components:

### Email Types
1. **Welcome Email**: Sent when users subscribe to newsletter
2. **Newsletter Email**: Sent to all active subscribers when new blog post is created

### Email Templates
- Located in `utils/emails/`
- `WelcomeEmail.js` - Welcome email template
- `NewsletterEmail.js` - Newsletter email template

### Configuration
- Uses Gmail SMTP
- Requires Gmail App Password
- Styled with inline CSS for email client compatibility

## ⚡ Real-time Features

### WebSocket Events
- `connection` - User connects
- `disconnect` - User disconnects
- `sendNotification` - Send notification
- `receiveNotification` - Receive notification

### Usage
```javascript
// Client-side example
socket.emit('sendNotification', { message: 'Hello World!' });
socket.on('receiveNotification', (data) => {
  console.log('Received:', data.message);
});
```

## 📊 Analytics

### Google Analytics 4 Integration
- Fetches real-time and historical data
- Metrics include: users, sessions, bounce rate, engagement rate
- Dimensions: date, page title, source, country, device, OS

### Available Data
- Total users and new users
- Sessions and page views
- Bounce rate and engagement rate
- Traffic sources and mediums
- Geographic data
- Device and OS information
- Currently online users (real-time)

## 🚀 Deployment

### Vercel Configuration
The project includes `vercel.json` for easy deployment:

```json
{
  "version": 2,
  "builds": [{ "src": "api/index.js", "use": "@vercel/node" }],
  "routes": [{ "src": "/api/(.*)", "dest": "/api/index.js" }]
}
```

### CORS Configuration
Allowed origins:
- `http://localhost:8080` (development)
- `https://www.chistanwrites.blog` (production)

## 📁 Project Structure

```
├── api/
│   ├── index.js              # Main server file
│   ├── models/               # Mongoose models
│   │   ├── blog.js
│   │   ├── user.js
│   │   ├── category.js
│   │   └── subscriber.js
│   └── routes/               # API routes
│       ├── blog.js
│       ├── user.js
│       ├── category.js
│       ├── subscriber.js
│       └── auth.js
├── utils/
│   ├── mailer.js            # Email utilities
│   └── emails/              # Email templates
│       ├── WelcomeEmail.js
│       └── NewsletterEmail.js
├── public/                  # Static files
├── package.json
├── vercel.json
└── README.md
```

## 🔒 Security Notes

- Passwords are stored in plain text (consider implementing bcrypt hashing)
- No JWT token authentication (consider implementing for production)
- CORS is configured for specific origins
- Environment variables are used for sensitive data

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📝 License

ISC License
