# AbleGod Backend

A comprehensive Node.js backend API for the AbleGod blog platform with real-time features, analytics integration, and email notifications.

## 🚀 Features

- **Blog Management**: Full CRUD operations for blog posts, categories, and users
- **Real-time Notifications**: WebSocket support using Socket.IO with comprehensive frontend examples
- **Email System**: Automated newsletter and welcome emails with React Email templates
- **Analytics Integration**: Google Analytics 4 (GA4) data fetching with **bounce rate exposure**
- **Subscriber Management**: Newsletter subscription system with automated email workflows
- **Authentication**: User login system with detailed API responses
- **Real-time Analytics**: Currently online users tracking and comprehensive metrics
- **Frontend-Ready API**: Detailed documentation with React/JavaScript integration examples
- **CORS Configured**: Ready for cross-origin requests from your frontend applications

## 📋 Table of Contents

- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [API Endpoints](#api-endpoints)
- [Models](#models)
- [Email System](#email-system)
- [Real-time Features](#real-time-features)
- [Analytics](#analytics)
- [Deployment](#deployment)
- [Frontend Integration Guide](#frontend-integration-guide)
- [Security Notes](#security-notes)
- [Contributing](#contributing)

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
- **`GET /`** - Get all blog posts
  ```json
  Response: [
    {
      "id": 1,
      "title": "Post Title",
      "excerpt": "Short description",
      "content": "Full content",
      "category": "Category Name",
      "subcategory": "Subcategory Name",
      "date": "2025-01-10",
      "readTime": "5 min read",
      "image": "image_url",
      "author": "Author Name",
      "status": "published",
      "likes": 10,
      "tags": ["tag1", "tag2"],
      "comments": [...]
    }
  ]
  ```

- **`POST /`** - Create new blog post (triggers newsletter emails to all active subscribers)
  ```json
  Request Body: {
    "title": "Post Title",
    "excerpt": "Short description",
    "content": "Full content",
    "category": "Category",
    "subcategory": "Subcategory",
    "image": "image_url",
    "author": "Author",
    "tags": ["tag1", "tag2"]
  }
  ```

- **`GET /subcategory/:subcategory`** - Get posts by subcategory
- **`GET /tags/:tag`** - Get posts by specific tag
- **`GET /tags`** - Get all distinct tags used across posts
- **`PUT /:id`** - Update blog post by ID
- **`DELETE /:id`** - Delete blog post by ID
- **`POST /:id/like`** - Like a post (increments like count)
- **`DELETE /:id/like`** - Unlike a post (decrements like count)
- **`POST /:id/comments`** - Add comment to post
  ```json
  Request Body: {
    "text": "Comment text",
    "author": "Commenter name"
  }
  Response: {
    "id": 123456789,
    "text": "Comment text",
    "author": "Commenter name",
    "date": "1/10/2025"
  }
  ```
- **`GET /:id/comments`** - Get all comments for a post

### Users (`/api/users`)
- **`GET /`** - Get all users
- **`POST /`** - Create new user
- **`PUT /:id`** - Update user by ID
- **`DELETE /:id`** - Delete user by ID

### Categories (`/api/categories`)
- **`GET /`** - Get all categories
- **`POST /`** - Create new category
- **`PUT /:id`** - Update category by ID
- **`DELETE /:id`** - Delete category by ID

### Subscribers (`/api/subscribers`)
- **`GET /`** - Get all subscribers
- **`POST /`** - Add new subscriber (automatically sends welcome email)
  ```json
  Request Body: {
    "id": 123,
    "email": "user@example.com",
    "name": "User Name"
  }
  ```
- **`PUT /:id`** - Update subscriber status (active/inactive)
- **`DELETE /:id`** - Delete subscriber

### Authentication (`/api`)
- **`POST /login`** - User login
  ```json
  Request Body: {
    "username": "username",
    "password": "password"
  }
  Response: {
    "success": true,
    "message": "Login successful",
    "user": {
      "id": 1,
      "role": "admin"
    }
  }
  ```

### Analytics (`/api`)
- **`GET /analytics?range={timeRange}`** - Get comprehensive GA4 analytics data

  **Query Parameters:**
  - `range`: Time range for data (`7d`, `14d`, `1m`, `3m`, `6m`, `all`)

  **Response Format:**
  ```json
  [
    {
      "date": "20250810",
      "pageTitle": "AbleGod - Faith, Creativity, and Prosperity",
      "referrer": {
        "source": "bing",
        "medium": "organic"
      },
      "location": {
        "country": "United States"
      },
      "device": {
        "category": "desktop"
      },
      "os": {
        "name": "Windows"
      },
      "metrics": {
        "totalUsers": 1,
        "newUsers": 0,
        "sessions": 1,
        "bounceRate": 0.75,        // 🎯 BOUNCE RATE (0.0 = 0%, 1.0 = 100%)
        "engagementRate": 0.25,    // Engagement rate (0.0 = 0%, 1.0 = 100%)
        "pageViews": 2
      }
    }
  ]
  ```

  **Bounce Rate Explanation:**
  - `0.0` = 0% bounce rate (users viewed multiple pages)
  - `0.5` = 50% bounce rate (half the sessions were single-page visits)
  - `1.0` = 100% bounce rate (all users left after viewing only one page)

  **Available Metrics:**
  - `totalUsers` - Total number of users
  - `newUsers` - Number of new users
  - `sessions` - Total sessions
  - `bounceRate` - Percentage of single-page sessions (0.0 to 1.0)
  - `engagementRate` - Percentage of engaged sessions (0.0 to 1.0)
  - `pageViews` - Total page views

  **Available Dimensions:**
  - `date` - Date in YYYYMMDD format
  - `pageTitle` - Title of the page
  - `referrer.source` - Traffic source (direct, bing, google, etc.)
  - `referrer.medium` - Traffic medium (organic, none, referral, etc.)
  - `location.country` - User's country
  - `device.category` - Device type (desktop, mobile, tablet)
  - `os.name` - Operating system (Windows, iOS, Android, etc.)

- **`GET /currently-online`** - Get real-time active users count
  ```json
  Response: {
    "currentlyOnline": 5
  }
  ```

### Notifications (`/api`)
- **`POST /notifications`** - Send real-time notification via WebSocket
  ```json
  Request Body: {
    "message": "Notification message",
    "userId": "optional_specific_user_id"  // Omit to send to all users
  }
  Response: {
    "success": true,
    "message": "Notification sent"
  }
  ```

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

### WebSocket Connection (Socket.IO)
**Server URL:** `ws://localhost:3001` (development) or `wss://your-domain.com` (production)

**CORS Configuration:**
- Allowed origins: `http://localhost:8080`, `https://www.chistanwrites.blog`
- Supported transports: `websocket`, `polling`

### WebSocket Events

#### Client → Server Events
- **`sendNotification`** - Send a notification to all connected users or specific user
  ```javascript
  socket.emit('sendNotification', {
    message: 'Hello World!',
    userId: 'optional_user_id'  // Omit to broadcast to all users
  });
  ```

#### Server → Client Events
- **`receiveNotification`** - Receive notifications from server
  ```javascript
  socket.on('receiveNotification', (data) => {
    console.log('Notification:', data.message);
    // Handle notification in your UI
  });
  ```

#### Connection Events
- **`connection`** - Triggered when user connects
- **`disconnect`** - Triggered when user disconnects

### Frontend Integration Examples

#### Basic Socket.IO Setup
```javascript
import io from 'socket.io-client';

// Connect to server
const socket = io('http://localhost:3001', {
  transports: ['websocket', 'polling']
});

// Listen for connection
socket.on('connect', () => {
  console.log('Connected to server:', socket.id);
});

// Listen for notifications
socket.on('receiveNotification', (notification) => {
  // Display notification in your UI
  showNotification(notification.message);
});

// Send notification
const sendNotification = (message) => {
  socket.emit('sendNotification', { message });
};
```

#### React Hook Example
```javascript
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

const useSocket = () => {
  const [socket, setSocket] = useState(null);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const newSocket = io('http://localhost:3001');

    newSocket.on('receiveNotification', (notification) => {
      setNotifications(prev => [...prev, notification]);
    });

    setSocket(newSocket);

    return () => newSocket.close();
  }, []);

  const sendNotification = (message) => {
    if (socket) {
      socket.emit('sendNotification', { message });
    }
  };

  return { socket, notifications, sendNotification };
};
```

### Health Check
- **Endpoint:** `GET /socket.io/test`
- **Response:** `{ "success": true, "message": "WebSocket server is running!" }`

## 📊 Analytics

### Google Analytics 4 Integration
- Fetches real-time and historical data from your GA4 property
- Comprehensive metrics including bounce rate, engagement rate, user data
- Multi-dimensional data breakdown by date, page, source, device, location
- Real-time active user tracking

### Frontend Integration Examples

#### Fetch Analytics Data
```javascript
// Fetch 7-day analytics data
const fetchAnalytics = async (timeRange = '7d') => {
  try {
    const response = await fetch(`/api/analytics?range=${timeRange}`);
    const analyticsData = await response.json();

    // Process bounce rate data
    analyticsData.forEach(entry => {
      const bounceRatePercentage = (entry.metrics.bounceRate * 100).toFixed(1);
      console.log(`${entry.pageTitle}: ${bounceRatePercentage}% bounce rate`);
    });

    return analyticsData;
  } catch (error) {
    console.error('Error fetching analytics:', error);
  }
};

// Usage
const data = await fetchAnalytics('30d'); // 30-day data
```

#### React Analytics Component Example
```javascript
import { useState, useEffect } from 'react';

const AnalyticsDashboard = () => {
  const [analytics, setAnalytics] = useState([]);
  const [timeRange, setTimeRange] = useState('7d');
  const [currentlyOnline, setCurrentlyOnline] = useState(0);

  useEffect(() => {
    fetchAnalyticsData();
    fetchCurrentlyOnline();
  }, [timeRange]);

  const fetchAnalyticsData = async () => {
    const response = await fetch(`/api/analytics?range=${timeRange}`);
    const data = await response.json();
    setAnalytics(data);
  };

  const fetchCurrentlyOnline = async () => {
    const response = await fetch('/api/currently-online');
    const data = await response.json();
    setCurrentlyOnline(data.currentlyOnline);
  };

  // Calculate average bounce rate
  const avgBounceRate = analytics.length > 0
    ? (analytics.reduce((sum, entry) => sum + entry.metrics.bounceRate, 0) / analytics.length * 100).toFixed(1)
    : 0;

  return (
    <div>
      <h2>Analytics Dashboard</h2>
      <p>Currently Online: {currentlyOnline} users</p>
      <p>Average Bounce Rate: {avgBounceRate}%</p>

      <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
        <option value="7d">Last 7 days</option>
        <option value="14d">Last 14 days</option>
        <option value="1m">Last month</option>
        <option value="3m">Last 3 months</option>
        <option value="6m">Last 6 months</option>
        <option value="all">All time</option>
      </select>

      {analytics.map((entry, index) => (
        <div key={index}>
          <h3>{entry.pageTitle}</h3>
          <p>Date: {entry.date}</p>
          <p>Bounce Rate: {(entry.metrics.bounceRate * 100).toFixed(1)}%</p>
          <p>Engagement Rate: {(entry.metrics.engagementRate * 100).toFixed(1)}%</p>
          <p>Page Views: {entry.metrics.pageViews}</p>
          <p>Source: {entry.referrer.source} ({entry.referrer.medium})</p>
        </div>
      ))}
    </div>
  );
};
```

### Available Metrics & Dimensions

#### Metrics (All values are numbers)
- **`totalUsers`** - Total number of users
- **`newUsers`** - Number of new users
- **`sessions`** - Total sessions
- **`bounceRate`** - Bounce rate as decimal (0.0 to 1.0)
  - `0.0` = 0% bounce rate (excellent engagement)
  - `0.5` = 50% bounce rate (average)
  - `1.0` = 100% bounce rate (poor engagement)
- **`engagementRate`** - Engagement rate as decimal (0.0 to 1.0)
- **`pageViews`** - Total page views

#### Dimensions (All values are strings)
- **`date`** - Date in YYYYMMDD format
- **`pageTitle`** - Title of the page
- **`referrer.source`** - Traffic source (direct, bing, google, facebook, etc.)
- **`referrer.medium`** - Traffic medium (organic, none, referral, social, etc.)
- **`location.country`** - User's country
- **`device.category`** - Device type (desktop, mobile, tablet)
- **`os.name`** - Operating system (Windows, iOS, Android, Macintosh, etc.)

### Time Range Options
- **`7d`** - Last 7 days
- **`14d`** - Last 14 days
- **`1m`** - Last month
- **`3m`** - Last 3 months
- **`6m`** - Last 6 months
- **`all`** - All available data (from 2020-01-01)

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

## 🌐 Frontend Integration Guide

### Complete API Base URL
```javascript
const API_BASE_URL = 'http://localhost:3001/api'; // Development
// const API_BASE_URL = 'https://your-domain.com/api'; // Production
```

### Essential Frontend Functions
```javascript
// Blog Posts
export const blogAPI = {
  getAllPosts: () => fetch(`${API_BASE_URL}/posts`).then(res => res.json()),
  getPostsByTag: (tag) => fetch(`${API_BASE_URL}/posts/tags/${tag}`).then(res => res.json()),
  likePost: (id) => fetch(`${API_BASE_URL}/posts/${id}/like`, { method: 'POST' }),
  addComment: (id, comment) => fetch(`${API_BASE_URL}/posts/${id}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(comment)
  })
};

// Analytics with Bounce Rate
export const analyticsAPI = {
  getAnalytics: (range = '7d') => fetch(`${API_BASE_URL}/analytics?range=${range}`).then(res => res.json()),
  getCurrentlyOnline: () => fetch(`${API_BASE_URL}/currently-online`).then(res => res.json()),

  // Helper function to calculate bounce rate percentage
  getBounceRatePercentage: (bounceRate) => (bounceRate * 100).toFixed(1) + '%'
};

// Subscribers
export const subscriberAPI = {
  subscribe: (subscriber) => fetch(`${API_BASE_URL}/subscribers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscriber)
  })
};

// Authentication
export const authAPI = {
  login: (credentials) => fetch(`${API_BASE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials)
  }).then(res => res.json())
};
```

### Socket.IO Integration
```javascript
import io from 'socket.io-client';

class SocketService {
  constructor() {
    this.socket = null;
  }

  connect() {
    this.socket = io('http://localhost:3001', {
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('Connected to server');
    });

    return this.socket;
  }

  onNotification(callback) {
    if (this.socket) {
      this.socket.on('receiveNotification', callback);
    }
  }

  sendNotification(message, userId = null) {
    if (this.socket) {
      this.socket.emit('sendNotification', { message, userId });
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

export default new SocketService();
```

### Bounce Rate Implementation Examples

#### Display Bounce Rate in Dashboard
```javascript
const BounceRateWidget = ({ analyticsData }) => {
  const avgBounceRate = analyticsData.length > 0
    ? analyticsData.reduce((sum, entry) => sum + entry.metrics.bounceRate, 0) / analyticsData.length
    : 0;

  const getBounceRateColor = (rate) => {
    if (rate < 0.3) return 'green';      // Excellent (< 30%)
    if (rate < 0.5) return 'orange';     // Good (30-50%)
    return 'red';                        // Needs improvement (> 50%)
  };

  return (
    <div className="bounce-rate-widget">
      <h3>Bounce Rate Analysis</h3>
      <div style={{ color: getBounceRateColor(avgBounceRate) }}>
        Average: {(avgBounceRate * 100).toFixed(1)}%
      </div>

      {analyticsData.map((entry, index) => (
        <div key={index} className="page-bounce-rate">
          <span>{entry.pageTitle}</span>
          <span style={{ color: getBounceRateColor(entry.metrics.bounceRate) }}>
            {(entry.metrics.bounceRate * 100).toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
};
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
