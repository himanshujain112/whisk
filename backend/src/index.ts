import { Hono } from "hono";
import { generateUniqueCode, MAX_FILE_SIZE } from "shared";
import { FileManager } from "./expiry";

export type Bindings = {
	DB: D1Database;
	BUCKET: R2Bucket;
	FILE_MANAGER: DurableObjectNamespace<FileManager>;
};
const app = new Hono<{ Bindings: Bindings }>();

const routes = app
	.get("/verify/:code", async (c) => {
		const code = c.req.param("code").toUpperCase();

		if (!/^[A-Z0-9]{6}$/.test(code)) {
			return c.json({ error: "Invalid code format" }, 400);
		}

		const result = await c.env.DB.prepare(
			"SELECT filename, size, content_type, is_downloaded FROM files WHERE code = ?",
		)
			.bind(code)
			.first();
		if (!result) {
			return c.json({ error: "Invalid code" }, 400);
		}
		return c.json(result);
	})
	.get("/download/:code", async (c) => {
		const code = c.req.param("code").toUpperCase();

		if (!/^[A-Z0-9]{6}$/.test(code)) {
			return c.json({ error: "Invalid code format" }, 400);
		}

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

		await c.env.DB.prepare(
			"UPDATE files SET is_downloaded = 1 WHERE code = ?",
		)
			.bind(code)
			.run();

		const headers = new Headers();
		obj.writeHttpMetadata(headers);
		headers.set(
			"Content-Disposition",
			`attachment; filename="${fileRecord.filename}"`,
		);
		return new Response(obj.body, {
			headers,
		});
	})
	.post("/upload", async (c) => {
		const formData = await c.req.formData();
		if (!formData.has("file")) {
			return c.json({ error: "No file uploaded" }, 400);
		}

		const file = formData.get("file") as unknown as File;
		if (!file || file.size === 0 || !file.name) {
			return c.json({ error: "No file uploaded" }, 400);
		}
		if (file.size > MAX_FILE_SIZE) {
			return c.json({ error: "File size exceeds the limit" }, 400);
		}

		const code = generateUniqueCode(6);

		const fileKey = `${Date.now()}-${file.name}`;

		await c.env.BUCKET.put(fileKey, file.stream(), {
			httpMetadata: {
				contentType: file.type,
			},
		});

		await c.env.DB.prepare(
			"INSERT INTO files (code, file_key, filename, size, content_type) VALUES (?, ?, ?, ?, ?)",
		)
			.bind(code, fileKey, file.name, file.size, file.type)
			.run();

		const janitorId = c.env.FILE_MANAGER.idFromName("global-janitor");
		await c.env.FILE_MANAGER.get(janitorId).schedule(code);

		return c.json({ code, status: "success" });
	});

export { FileManager };
export type AppType = typeof routes;
export default app;
