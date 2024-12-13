// api/routes/auth.js
const express = require('express');
const router = express.Router();
const User = require('../models/user');

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username });
        if (user && user.password === password) {
            res.json({
                success: true,
                message: "Login successful",
                user: {
                    id: user.id,
                    role: user.role,
                },
            });
        } else {
            res
                .status(401)
                .json({ success: false, message: "Invalid username or password" });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});

module.exports = router;