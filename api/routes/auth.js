// api/routes/auth.js
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const router = express.Router();
const User = require("../models/user");
const RefreshToken = require("../models/refreshToken");
const { sendEmail } = require("../../utils/mailer");
const {
	authenticate,
	authenticateOptional,
	getJwtSecret,
} = require("../middleware/auth");

function sanitizeUser(user) {
	return {
		id: user.id,
		username: user.username,
		name:
			[user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
			user.username ||
			"",
		email: user.email || "",
		role: user.role || "user",
		status: user.status || "active",
		avatar_url: user.avatar_url || "",
	};
}

function buildCapabilitiesForRole(role) {
	const normalizedRole = role || "user";
	const base = [
		"feed:read",
		"follow:read",
		"follow:write",
		"profile:update:self",
		"post:interact",
		"chat:read",
		"chat:send",
		"notifications:read:self",
		"stream:read",
		"stream:create",
		"stream:reply",
	];

	if (normalizedRole === "author") {
		return [...base, "post:create", "post:update:own", "analytics:read:creator"];
	}

	if (normalizedRole === "admin") {
		return [
			...base,
			"post:create",
			"post:update:any",
			"post:delete:any",
			"post:publish",
			"users:read:admin",
			"users:write:admin",
			"subscribers:read",
			"subscribers:write",
			"categories:write",
			"analytics:read:admin",
			"notifications:write:any",
			"chat:moderate",
			"stream:moderate",
			"stream:feature",
		];
	}

	return base;
}

async function issueAuthResponse(user) {
	const safeUser = sanitizeUser(user);
	const capabilities = buildCapabilitiesForRole(safeUser.role);
	const accessToken = jwt.sign(
		{
			sub: String(safeUser.id),
			role: safeUser.role,
			capabilities,
		},
		getJwtSecret(),
		{ expiresIn: "1d" } // Access token: 1 day
	);

	const refreshTokenValue = crypto.randomBytes(40).toString("hex");
	const refreshToken = new RefreshToken({
		token: refreshTokenValue,
		user_id: String(safeUser.id),
		expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
	});
	await refreshToken.save();

	return {
		success: true,
		message: "Login successful",
		user: {
			...safeUser,
			capabilities,
		},
		token: accessToken,
		refresh_token: refreshTokenValue,
	};
}

function hashPasswordResetToken(rawToken) {
	return crypto.createHash("sha256").update(String(rawToken || "")).digest("hex");
}

function resolveFrontendBaseUrl(req) {
	const configured =
		process.env.FRONTEND_URL ||
		process.env.APP_URL ||
		process.env.CLIENT_URL;
	if (configured) return String(configured).replace(/\/+$/, "");

	const originHeader = req.get("origin");
	if (originHeader) return String(originHeader).replace(/\/+$/, "");

	return "http://localhost:8080";
}

function buildPasswordResetUrl(req, { token, email }) {
	const baseUrl = resolveFrontendBaseUrl(req);
	const searchParams = new URLSearchParams({
		token: String(token || ""),
		email: String(email || ""),
	});
	return `${baseUrl}/auth/reset-password?${searchParams.toString()}`;
}

function buildPasswordResetEmailHtml({ resetUrl, user }) {
	const displayName =
		[user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() ||
		user?.username ||
		"Friend";

	return `
		<div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto; color: #111827;">
			<div style="padding: 24px; border-radius: 20px; background: #ffffff; border: 1px solid rgba(17,24,39,0.08);">
				<p style="margin:0 0 8px; font-size:12px; letter-spacing:0.22em; text-transform:uppercase; color:#6b7280;">AbleGod Stream</p>
				<h1 style="margin:0 0 12px; font-size:24px; line-height:1.2;">Reset your password</h1>
				<p style="margin:0 0 16px; color:#374151; line-height:1.5;">
					Hello ${displayName}, we received a request to reset your password.
				</p>
				<p style="margin:0 0 20px; color:#374151; line-height:1.5;">
					Use the secure link below to set a new password. This link expires in 1 hour.
				</p>
				<p style="margin:0 0 22px;">
					<a href="${resetUrl}" style="display:inline-block; background:#111827; color:#ffffff; text-decoration:none; padding:12px 16px; border-radius:12px; font-weight:600;">
						Reset Password
					</a>
				</p>
				<p style="margin:0 0 8px; color:#6b7280; font-size:12px;">If the button does not work, copy this link:</p>
				<p style="margin:0; color:#6b7280; font-size:12px; word-break:break-all;">${resetUrl}</p>
			</div>
		</div>
	`;
}

async function comparePasswordAndMigrateIfNeeded(user, inputPassword) {
	const storedPassword = user.password || "";
	if (!storedPassword) return false;

	const looksHashed = /^\$2[aby]\$\d{2}\$/.test(storedPassword);
	if (looksHashed) {
		return bcrypt.compare(inputPassword, storedPassword);
	}

	// Backward-compatible login for legacy plaintext passwords.
	if (storedPassword === inputPassword) {
		try {
			user.password = await bcrypt.hash(inputPassword, 10);
			await user.save();
			console.log(`[auth] Migrated plaintext password for user: ${user.username}`);
		} catch (error) {
			console.error("[auth] Failed to migrate password hash:", error.message);
		}
		return true;
	}

	return false;
}

router.post("/login", async (req, res) => {
	const { username, email, password } = req.body || {};
	const identifier = String(username || email || "").trim();

	if (!identifier || !password) {
		return res.status(400).json({
			success: false,
			message: "Username/email and password are required",
		});
	}

	try {
		const normalizedEmail = identifier.toLowerCase();
		const user = await User.findOne({
			$or: [{ username: identifier }, { email: normalizedEmail }, { email: identifier }],
		});

		if (!user) {
			return res.status(401).json({
				success: false,
				message: "Invalid username or password",
			});
		}

		if (String(user.status || "active").toLowerCase() === "inactive") {
			return res.status(403).json({
				success: false,
				message: "Account is inactive",
			});
		}

		const isPasswordValid = await comparePasswordAndMigrateIfNeeded(user, password);
		if (!isPasswordValid) {
			return res.status(401).json({
				success: false,
				message: "Invalid username or password",
			});
		}

		const nowIso = new Date().toISOString();
		try {
			user.lastLogin = nowIso;
			user.activities = [
				...(Array.isArray(user.activities) ? user.activities : []),
				{
					id: Date.now(),
					type: "login",
					timestamp: nowIso,
					details: "User logged in",
				},
			];
			await user.save();
		} catch (persistError) {
			// Auth should not fail if non-critical activity persistence fails (legacy docs/schema edge cases).
			console.error("[auth] Login succeeded but failed to persist login activity:", persistError);
			try {
				await User.updateOne({ _id: user._id }, { $set: { lastLogin: nowIso } });
				user.lastLogin = nowIso;
			} catch (lastLoginError) {
				console.error("[auth] Failed to persist lastLogin fallback:", lastLoginError);
			}
		}

		return res.json(await issueAuthResponse(user));
	} catch (error) {
		console.error("Auth login error:", error);
		return res.status(500).json({
			success: false,
			message: "Internal server error",
		});
	}
});

router.post("/register", authenticateOptional, async (req, res) => {
	try {
		const {
			username,
			name,
			email,
			password,
			role: requestedRole = "user",
			status: requestedStatus = "active",
		} = req.body || {};

		if (!username || !email || !password) {
			return res.status(400).json({
				success: false,
				message: "username, email and password are required",
			});
		}

		const existing = await User.findOne({
			$or: [{ username }, { email }],
		});
		if (existing) {
			return res.status(409).json({
				success: false,
				message: "User with this username or email already exists",
			});
		}

		const requester = req.auth?.user || null;
		const isAdminRequester = requester?.role === "admin";
		const role = isAdminRequester ? requestedRole : "user";
		const status = isAdminRequester ? requestedStatus : "active";

		const [first_name, ...restName] = String(name || "").trim().split(/\s+/).filter(Boolean);
		const last_name = restName.join(" ");
		const hashedPassword = await bcrypt.hash(password, 10);

		const newUser = new User({
			id: uuidv4(),
			username: String(username).trim(),
			email: String(email).trim().toLowerCase(),
			first_name: first_name || undefined,
			last_name: last_name || undefined,
			role,
			status,
			password: hashedPassword,
			createdAt: new Date().toISOString(),
			lastLogin: "",
			activities: [],
		});

		await newUser.save();

		return res.status(201).json({
			success: true,
			message: "Registration successful",
			user: {
				...sanitizeUser(newUser),
				capabilities: buildCapabilitiesForRole(newUser.role),
			},
		});
	} catch (error) {
		console.error("Auth register error:", error);
		return res.status(500).json({
			success: false,
			message: "Registration failed",
		});
	}
});

router.post("/password/forgot", async (req, res) => {
	try {
		const email = String(req.body?.email || "").trim().toLowerCase();
		if (!email) {
			return res.status(400).json({
				success: false,
				message: "Email is required",
			});
		}

		const user = await User.findOne({ email });
		if (!user) {
			// Prevent user enumeration.
			return res.json({
				success: true,
				message: "If an account exists for that email, a reset link has been sent.",
			});
		}

		const rawToken = crypto.randomBytes(32).toString("hex");
		const tokenHash = hashPasswordResetToken(rawToken);
		const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
		const requestedAt = new Date().toISOString();

		user.password_reset_token_hash = tokenHash;
		user.password_reset_token_expires_at = expiresAt;
		user.password_reset_requested_at = requestedAt;
		await user.save();

		const resetUrl = buildPasswordResetUrl(req, { token: rawToken, email: user.email });
		if (process.env.NODE_ENV !== "test") {
			await sendEmail(
				user.email,
				"AbleGod Password Reset",
				buildPasswordResetEmailHtml({ resetUrl, user })
			);
		}

		return res.json({
			success: true,
			message: "If an account exists for that email, a reset link has been sent.",
			...(process.env.NODE_ENV === "test"
				? {
					debug: {
						reset_token: rawToken,
						reset_url: resetUrl,
					},
				}
				: {}),
		});
	} catch (error) {
		console.error("Auth password forgot error:", error);
		return res.status(500).json({
			success: false,
			message: "Failed to process password reset request",
		});
	}
});

router.post("/password/reset", async (req, res) => {
	try {
		const token = String(req.body?.token || "").trim();
		const nextPassword = String(req.body?.password || "");
		const email = String(req.body?.email || "").trim().toLowerCase();

		if (!token || !nextPassword) {
			return res.status(400).json({
				success: false,
				message: "Token and password are required",
			});
		}

		if (nextPassword.length < 6) {
			return res.status(400).json({
				success: false,
				message: "Password must be at least 6 characters",
			});
		}

		const tokenHash = hashPasswordResetToken(token);
		const user = await User.findOne({ password_reset_token_hash: tokenHash });

		if (!user) {
			return res.status(400).json({
				success: false,
				message: "Invalid or expired reset link",
			});
		}

		if (email && String(user.email || "").toLowerCase() !== email) {
			return res.status(400).json({
				success: false,
				message: "Invalid or expired reset link",
			});
		}

		const expiryTime = new Date(user.password_reset_token_expires_at || 0).getTime();
		if (!Number.isFinite(expiryTime) || expiryTime < Date.now()) {
			return res.status(400).json({
				success: false,
				message: "Invalid or expired reset link",
			});
		}

		user.password = await bcrypt.hash(nextPassword, 10);
		user.password_reset_token_hash = undefined;
		user.password_reset_token_expires_at = undefined;
		user.password_reset_requested_at = undefined;
		user.lastLogin = user.lastLogin || "";
		user.activities = [
			...(Array.isArray(user.activities) ? user.activities : []),
			{
				id: Date.now(),
				type: "password_reset",
				timestamp: new Date().toISOString(),
				details: "Password reset completed",
			},
		];
		await user.save();

		return res.json({
			success: true,
			message: "Password has been reset successfully",
		});
	} catch (error) {
		console.error("Auth password reset error:", error);
		return res.status(500).json({
			success: false,
			message: "Failed to reset password",
		});
	}
});

router.get("/me", authenticate, async (req, res) => {
	try {
		const user = req.auth.user;
		return res.json({
			success: true,
			user: {
				...sanitizeUser(user),
				capabilities: buildCapabilitiesForRole(user.role),
			},
		});
	} catch (error) {
		console.error("Auth me error:", error);
		return res.status(500).json({
			success: false,
			message: "Failed to fetch session",
		});
	}
});

router.post("/refresh-token", async (req, res) => {
	try {
		const { refresh_token } = req.body || {};
		if (!refresh_token) {
			return res.status(400).json({ success: false, message: "Refresh token is required" });
		}

		const storedToken = await RefreshToken.findOne({
			token: refresh_token,
			revoked_at: null,
			expires_at: { $gt: new Date() },
		});

		if (!storedToken) {
			return res.status(401).json({ success: false, message: "Invalid or expired refresh token" });
		}

		const user = await User.findOne({ id: storedToken.user_id });
		if (!user || user.status === "inactive") {
			return res.status(401).json({ success: false, message: "User not found or inactive" });
		}

		// Revoke old token and issue new pair
		storedToken.revoked_at = new Date();
		await storedToken.save();

		const authResponse = await issueAuthResponse(user);
		return res.json(authResponse);
	} catch (error) {
		console.error("Refresh token error:", error);
		return res.status(500).json({ success: false, message: "Failed to refresh token" });
	}
});

router.post("/logout", authenticate, async (req, res) => {
	try {
		const { refresh_token } = req.body || {};
		if (refresh_token) {
			await RefreshToken.updateOne(
				{ token: refresh_token, user_id: String(req.auth.user.id) },
				{ $set: { revoked_at: new Date() } }
			);
		}
		return res.json({ success: true, message: "Logged out successfully" });
	} catch (error) {
		console.error("Logout error:", error);
		return res.status(500).json({ success: false, message: "Logout failed" });
	}
});

router.post("/password/change", authenticate, async (req, res) => {
	try {
		const { current_password, new_password } = req.body || {};
		const user = await User.findOne({ id: req.auth.user.id });

		if (!user) {
			return res.status(404).json({ success: false, message: "User not found" });
		}

		const isValid = await bcrypt.compare(current_password, user.password);
		if (!isValid) {
			return res.status(401).json({ success: false, message: "Invalid current password" });
		}

		if (String(new_password).length < 6) {
			return res.status(400).json({ success: false, message: "New password too short" });
		}

		user.password = await bcrypt.hash(String(new_password), 10);
		await user.save();

		return res.json({ success: true, message: "Password updated successfully" });
	} catch (error) {
		console.error("Password change error:", error);
		return res.status(500).json({ success: false, message: "Failed to change password" });
	}
});

router.post("/deactivate", authenticate, async (req, res) => {
	try {
		const user = await User.findOne({ id: req.auth.user.id });
		if (!user) return res.status(404).json({ success: false, message: "User not found" });

		user.status = "inactive";
		await user.save();

		// Revoke all tokens
		await RefreshToken.updateMany(
			{ user_id: String(user.id), revoked_at: null },
			{ $set: { revoked_at: new Date() } }
		);

		return res.json({ success: true, message: "Account deactivated" });
	} catch (error) {
		console.error("Deactivation error:", error);
		return res.status(500).json({ success: false, message: "Failed to deactivate account" });
	}
});

router.post("/request-deletion", authenticate, async (req, res) => {
	try {
		const user = await User.findOne({ id: req.auth.user.id });
		if (!user) return res.status(404).json({ success: false, message: "User not found" });

		// Mark for deletion in metadata
		if (!user.metadata) user.metadata = {};
		user.metadata.deletion_requested_at = new Date().toISOString();
		user.status = "pending_deletion";
		await user.save();

		// Optional: Log a moderation action
		return res.json({ success: true, message: "Account deletion request received" });
	} catch (error) {
		console.error("Deletion request error:", error);
		return res.status(500).json({ success: false, message: "Failed to request deletion" });
	}
});

module.exports = router;
