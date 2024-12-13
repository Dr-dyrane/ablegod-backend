// api/models/user.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    id: Number,
    username: String,
    name: String,
    email: String,
    role: String,
    status: String,
    password: String,
    createdAt: String,
    lastLogin: String,
    activities: [{
        id: Number,
        type: String,
        timestamp: String,
        details: String,
    }],
});

module.exports = mongoose.model('User', userSchema);