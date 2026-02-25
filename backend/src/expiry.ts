import { DurableObject } from "cloudflare:workers";
import { EXPIRY_TIME } from "../../packages/shared/constants";
import { Bindings } from "./index";

export class FileManager extends DurableObject<Bindings> {
	constructor(ctx: DurableObjectState, env: Bindings) {
		super(ctx, env);
	}

	async fetch(request: Request): Promise<Response> {
		return new Response("Whisk Expiry Service", { status: 200 });
	}

	async schedule(code: string) {
		await this.ctx.storage.put(`expire:${code}`, Date.now() + EXPIRY_TIME);
		await this.ctx.storage.setAlarm(Date.now() + EXPIRY_TIME);
	}

	async alarm() {
		const now = Date.now();
		const storage = await this.ctx.storage.list({ prefix: "expire:" });

		for (const [key, expiry] of storage) {
			const expiryTime = expiry as number;

			if (expiryTime <= now) {
				const codeStr = key.split(":")[1];

				const file = await this.env.DB.prepare(
					"SELECT file_key FROM files WHERE code = ?",
				)
					.bind(codeStr)
					.first<{ file_key: string }>();

				if (file) {
					await this.env.BUCKET.delete(file.file_key);
					await this.env.DB.prepare(
						"DELETE FROM files WHERE code = ?",
					)
						.bind(codeStr)
						.run();

					console.log(`[Janitor] Deleted expired file: ${codeStr}`);
				}

				await this.ctx.storage.delete(key);
			}
		}
	}
}
