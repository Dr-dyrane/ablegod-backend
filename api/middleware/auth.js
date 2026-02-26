const jwt = require("jsonwebtoken");
const User = require("../models/user");
const authRuntimeState = globalThis.__ABLEGOD_AUTH_RUNTIME_STATE__ || {
	cachedJwtSecret: null,
	hasWarnedAboutDevJwtSecret: false,
};
globalThis.__ABLEGOD_AUTH_RUNTIME_STATE__ = authRuntimeState;

function authError(res, status, message) {
	return res.status(status).json({
		success: false,
		message,
	});
}

function getJwtSecret() {
	if (authRuntimeState.cachedJwtSecret) return authRuntimeState.cachedJwtSecret;

	const secret = process.env.JWT_SECRET;
	if (secret) {
		authRuntimeState.cachedJwtSecret = secret;
		return authRuntimeState.cachedJwtSecret;
	}

	if (process.env.NODE_ENV !== "production") {
		if (!authRuntimeState.hasWarnedAboutDevJwtSecret) {
			authRuntimeState.hasWarnedAboutDevJwtSecret = true;
			console.warn(
				"[auth] JWT_SECRET is not set. Using development fallback secret. Set JWT_SECRET in production."
			);
		}
		authRuntimeState.cachedJwtSecret = "ablegod-dev-secret-change-me";
		return authRuntimeState.cachedJwtSecret;
	}

	throw new Error("JWT_SECRET is not configured");
}

async function findUserByIdFlexible(userId) {
	if (!userId) return null;
	const idAsString = String(userId);
	const idAsNumber = Number.isNaN(Number(userId)) ? null : Number(userId);

	const query =
		idAsNumber === null
			? { id: idAsString }
			: { $or: [{ id: idAsString }, { id: idAsNumber }] };

	let user = await User.findOne(query);
	if (!user) {
		const allUsers = await User.find();
		user = allUsers.find((u) => String(u.id) === idAsString) || null;
	}
	return user;
}

function getBearerToken(req) {
	const authHeader = req.headers.authorization || "";
	const [scheme, token] = authHeader.split(" ");
	if (scheme !== "Bearer" || !token) return null;
	return token;
}

async function resolveAuthContextFromToken(token) {
	const payload = jwt.verify(token, getJwtSecret());
	const user = await findUserByIdFlexible(payload.sub || payload.userId);

	if (!user) {
		const error = new Error("Invalid session");
		error.statusCode = 401;
		throw error;
	}

	if (user.status && String(user.status).toLowerCase() === "inactive") {
		const error = new Error("Account is inactive");
		error.statusCode = 403;
		throw error;
	}

	return {
		token,
		payload,
		user,
	};
}

async function authenticate(req, res, next) {
	try {
		const token = getBearerToken(req);
		if (!token) {
			return authError(res, 401, "Authentication required");
		}

		req.auth = await resolveAuthContextFromToken(token);

		next();
	} catch (error) {
		if (error?.statusCode === 403) {
			return authError(res, 403, error.message || "Account is inactive");
		}
		return authError(res, 401, "Invalid or expired token");
	}
}

async function authenticateOptional(req, _res, next) {
	try {
		const token = getBearerToken(req);
		if (!token) {
			req.auth = null;
			return next();
		}

		req.auth = await resolveAuthContextFromToken(token);
		return next();
	} catch (error) {
		req.auth = null;
		return next();
	}
}

function authorize(...roles) {
	return (req, res, next) => {
		if (!req.auth?.user) {
			return authError(res, 401, "Authentication required");
		}

		if (roles.length === 0) return next();

		const userRole = req.auth.user.role;
		if (!roles.includes(userRole)) {
			return authError(res, 403, "Insufficient permissions");
		}

		next();
	};
}

const authorizeRoles = authorize;

function authorizeCapabilities(...requiredCapabilities) {
	return (req, res, next) => {
		if (!req.auth?.user) {
			return authError(res, 401, "Authentication required");
		}

		if (requiredCapabilities.length === 0) return next();

		const tokenCapabilities = Array.isArray(req.auth?.payload?.capabilities)
			? req.auth.payload.capabilities
			: [];
		const userCapabilities = Array.isArray(req.auth?.user?.capabilities)
			? req.auth.user.capabilities
			: [];
		const granted = new Set([...tokenCapabilities, ...userCapabilities].filter(Boolean));

		const hasAnyRequiredCapability = requiredCapabilities.some((capability) =>
			granted.has(capability)
		);

		if (!hasAnyRequiredCapability) {
			return authError(res, 403, "Insufficient permissions");
		}

		next();
	};
}

function requireCapabilities(...capabilities) {
	return [authenticate, authorizeCapabilities(...capabilities)];
}

function authorizeSelfOrRoles({
	paramKey = "id",
	roles = ["admin"],
	userIdResolver,
} = {}) {
	return (req, res, next) => {
		const authUser = req.auth?.user;
		if (!authUser) {
			return authError(res, 401, "Authentication required");
		}

		const targetId = typeof userIdResolver === "function"
			? userIdResolver(req)
			: req.params?.[paramKey];

		const isSelf = String(authUser.id) === String(targetId);
		const hasRoleAccess = roles.includes(authUser.role);

		if (!isSelf && !hasRoleAccess) {
			return authError(res, 403, "Insufficient permissions");
		}

		next();
	};
}

const requireAdmin = [authenticate, authorizeRoles("admin")];
const requireAdminOrAuthor = [authenticate, authorizeRoles("admin", "author")];

function requireSelfOrAdmin(paramKey = "id") {
	return [authenticate, authorizeSelfOrRoles({ paramKey, roles: ["admin"] })];
}

module.exports = {
	authenticate,
	authenticateOptional,
	authorize,
	authorizeRoles,
	authorizeCapabilities,
	authorizeSelfOrRoles,
	requireAdmin,
	requireAdminOrAuthor,
	requireCapabilities,
	requireSelfOrAdmin,
	getJwtSecret,
	getBearerToken,
	resolveAuthContextFromToken,
	findUserByIdFlexible,
};
