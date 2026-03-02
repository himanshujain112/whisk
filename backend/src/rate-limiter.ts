import { DurableObject } from "cloudflare:workers";
import type { Bindings } from "./index";

type RequestLog = {
	timestamp: number;
	count: number;
};

export class RateLimiter extends DurableObject<Bindings> {
	constructor(ctx: DurableObjectState, env: Bindings) {
		super(ctx, env);
	}

	async fetch(request: Request): Promise<Response> {
		return new Response("Rate Limiter Service", { status: 200 });
	}

	async checkRateLimit(
		ip: string,
		limit: number = 100,
		windowMs: number = 60000,
	): Promise<boolean> {
		try {
			const key = `rate:${ip}`;
			const now = Date.now();

			let data = (await this.ctx.storage.get<RequestLog>(key)) || {
				timestamp: now,
				count: 0,
			};

			// Reset if window has passed
			if (now - data.timestamp > windowMs) {
				data = {
					timestamp: now,
					count: 1,
				};
			} else {
				data.count++;
			}

			await this.ctx.storage.put(key, data);

			return data.count <= limit;
		} catch (err) {
			console.warn("Rate limiter storage error (allowing request):", err);
			// In case of storage errors, allow the request
			return true;
		}
	}
}
