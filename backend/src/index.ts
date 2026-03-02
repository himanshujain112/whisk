import { Hono } from "hono";
import { generateUniqueCode, MAX_FILE_SIZE } from "shared";
import { FileManager } from "./expiry";
import { RateLimiter } from "./rate-limiter";

// Allowed MIME types for safer file handling
const ALLOWED_MIME_TYPES = [
	"application/pdf",
	"text/plain",
	"image/jpeg",
	"image/png",
	"image/gif",
	"image/webp",
	"application/gzip",
	"application/msword",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"application/vnd.ms-excel",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"application/zip",
	"application/x-rar-compressed",
];

const ALLOWED_ORIGINS = [
	"https://whisk.codemeoww.com",
	"http://localhost:3000",
	"http://localhost:5173",
	"http://127.0.0.1:3000",
	"http://127.0.0.1:5173",
];
const RATE_LIMIT_MAX_REQUESTS = 30;
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute

export type Bindings = {
	DB: D1Database;
	BUCKET: R2Bucket;
	FILE_MANAGER: DurableObjectNamespace<FileManager>;
	RATE_LIMITER: DurableObjectNamespace<RateLimiter>;
	API_KEY: string;
	ENVIRONMENT: "development" | "production";
	TURNSTILE_SECRET_KEY: string;
};

const app = new Hono<{ Bindings: Bindings }>();

function getClientIP(c: any): string {
	return (
		c.req.header("cf-connecting-ip") ||
		c.req.header("x-forwarded-for")?.split(",")[0] ||
		c.req.header("x-real-ip") ||
		"unknown"
	);
}

function isOriginAllowed(origin: string | undefined | null): boolean {
	if (!origin) return false;
	return ALLOWED_ORIGINS.some((allowed) => origin === allowed);
}

function sanitizeFilename(filename: string): string {
	// Remove path components and dangerous characters
	return (
		filename
			.split(/[/\\]/)
			.pop()
			?.replace(/[<>:"|?*\x00-\x1f]/g, "_") || "file"
	);
}

async function verifyTurnstileToken(
	token: string,
	secretKey: string,
): Promise<boolean> {
	try {
		const response = await fetch(
			"https://challenges.cloudflare.com/turnstile/v0/siteverify",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					secret: secretKey,
					response: token,
				}),
			},
		);

		if (!response.ok) {
			console.error("Turnstile API error:", response.status);
			return false;
		}

		const data = (await response.json()) as {
			success: boolean;
			error_codes?: string[];
		};
		return data.success === true;
	} catch (err) {
		console.error("Turnstile verification error:", err);
		return false;
	}
}

app.use("*", async (c, next) => {
	const origin = c.req.header("origin");
	const isAllowed = isOriginAllowed(origin);

	// Set CORS headers only if origin is allowed
	if (isAllowed) {
		c.res.headers.set("Access-Control-Allow-Origin", origin!);
	}

	c.res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
	c.res.headers.set(
		"Access-Control-Allow-Headers",
		"Content-Type, Authorization",
	);
	c.res.headers.set("Access-Control-Max-Age", "3600");

	// Security Headers
	c.res.headers.set("X-Content-Type-Options", "nosniff");
	c.res.headers.set("X-Frame-Options", "DENY");
	c.res.headers.set("X-XSS-Protection", "1; mode=block");
	c.res.headers.set(
		"Strict-Transport-Security",
		"max-age=31536000; includeSubDomains",
	);
	c.res.headers.set(
		"Content-Security-Policy",
		"default-src 'none'; frame-ancestors 'none'",
	);

	if (c.req.method === "OPTIONS") {
		return c.text("OK", 200);
	}

	// Block requests from disallowed origins (except GET requests without origin)
	if (origin && !isAllowed && c.req.method !== "GET") {
		return c.json({ error: "Access denied" }, 403);
	}

	await next();
});

app.use("*", async (c, next) => {
	try {
		const ip = getClientIP(c);
		const rateLimiterId = c.env.RATE_LIMITER.idFromName("global-limiter");
		const limiter = c.env.RATE_LIMITER.get(rateLimiterId);

		const isAllowed = await limiter.checkRateLimit(
			ip,
			RATE_LIMIT_MAX_REQUESTS,
			RATE_LIMIT_WINDOW_MS,
		);

		if (!isAllowed) {
			return c.json(
				{ error: "Too many requests. Please try again later." },
				429,
			);
		}
	} catch (err) {
		console.warn("Rate limiter middleware error (allowing request):", err);
		// In case of rate limiter errors, continue to next middleware
	}

	await next();
});

const routes = app
	.get("/verify/:code", async (c) => {
		const code = c.req.param("code").toUpperCase();

		// Validate code format
		if (!/^[A-Z0-9]{6}$/.test(code)) {
			return c.json({ error: "Invalid code format" }, 400);
		}

		try {
			const result = await c.env.DB.prepare(
				"SELECT filename, size, content_type, is_downloaded FROM files WHERE code = ?",
			)
				.bind(code)
				.first();

			if (!result) {
				return c.json({ error: "File not found" }, 404);
			}

			return c.json(result);
		} catch (err) {
			console.error("Verify endpoint error:", err);
			return c.json({ error: "Internal server error" }, 500);
		}
	})
	.get("/download/:code", async (c) => {
		const code = c.req.param("code").toUpperCase();

		// Validate code format
		if (!/^[A-Z0-9]{6}$/.test(code)) {
			return c.json({ error: "Invalid code format" }, 400);
		}

		try {
			const fileRecord = await c.env.DB.prepare(
				"SELECT file_key, filename FROM files WHERE code = ?",
			)
				.bind(code)
				.first<{ file_key: string; filename: string }>();

			if (!fileRecord) {
				return c.json({ error: "File not found" }, 404);
			}

			const obj = await c.env.BUCKET.get(fileRecord.file_key);
			if (!obj) {
				return c.json({ error: "File not found" }, 404);
			}

			// Update download status
			await c.env.DB.prepare(
				"UPDATE files SET is_downloaded = 1 WHERE code = ?",
			)
				.bind(code)
				.run();

			// Set response headers
			const headers = new Headers();
			obj.writeHttpMetadata(headers);

			// Sanitize and set filename
			const sanitizedFilename = sanitizeFilename(fileRecord.filename);
			headers.set(
				"Content-Disposition",
				`attachment; filename="${sanitizedFilename}"`,
			);
			headers.set("Cache-Control", "no-cache, no-store, must-revalidate");

			return new Response(obj.body, { headers });
		} catch (err) {
			console.error("Download endpoint error:", err);
			return c.json({ error: "Internal server error" }, 500);
		}
	})
	.post("/upload", async (c) => {
		const isDevelopment = c.env.ENVIRONMENT !== "production";

		if (!isDevelopment) {
			// Verify API key only in production
			const apiKey = c.req
				.header("authorization")
				?.replace("Bearer ", "");
			if (!apiKey || apiKey !== c.env.API_KEY) {
				return c.json({ error: "Unauthorized" }, 401);
			}
		}

		try {
			const formData = await c.req.formData();
			
			// Verify Turnstile token
			const turnstileToken = formData.get("turnstileToken") as string;
			if (!turnstileToken) {
				return c.json(
					{ error: "Turnstile verification required" },
					400,
				);
			}

			const isValidToken = await verifyTurnstileToken(
				turnstileToken,
				c.env.TURNSTILE_SECRET_KEY,
			);
			if (!isValidToken) {
				return c.json(
					{ error: "Turnstile verification failed" },
					403,
				);
			}

			if (!formData.has("file")) {
				return c.json({ error: "No file uploaded" }, 400);
			}

			const file = formData.get("file") as unknown as File;
			if (!file || file.size === 0 || !file.name) {
				return c.json({ error: "Invalid file" }, 400);
			}

			// Validate file size
			if (file.size > MAX_FILE_SIZE) {
				return c.json(
					{
						error: `File size exceeds the limit of ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB`,
					},
					413,
				);
			}

			// Validate MIME type
			if (!ALLOWED_MIME_TYPES.includes(file.type)) {
				return c.json(
					{
						error: "File type not allowed. Supported types: PDF, images, documents, archives",
					},
					400,
				);
			}

			const code = generateUniqueCode(6);
			const fileKey = `${Date.now()}-${Math.random().toString(36).substring(7)}-${sanitizeFilename(file.name)}`;

			// Upload to R2
			await c.env.BUCKET.put(fileKey, file.stream(), {
				httpMetadata: {
					contentType: file.type,
					cacheControl: "no-cache",
				},
			});

			// Store in database
			await c.env.DB.prepare(
				"INSERT INTO files (code, file_key, filename, size, content_type) VALUES (?, ?, ?, ?, ?)",
			)
				.bind(code, fileKey, file.name, file.size, file.type)
				.run();

			// Schedule file expiry
			const janitorId = c.env.FILE_MANAGER.idFromName("global-janitor");
			await c.env.FILE_MANAGER.get(janitorId).schedule(code);

			return c.json({ code, status: "success" });
		} catch (err) {
			console.error("Upload endpoint error:", err);
			return c.json({ error: "Internal server error" }, 500);
		}
	});

export { FileManager, RateLimiter };
export type AppType = typeof routes;
export default app;
