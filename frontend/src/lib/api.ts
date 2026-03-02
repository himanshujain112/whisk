import { hc } from "hono/client";
import type { AppType } from "backend";
import { MAX_FILE_SIZE } from "shared";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8787";
const API_KEY = import.meta.env.VITE_API_KEY;

const client = hc<AppType>(BASE_URL);

export function uploadFile(file: File, turnstileToken: string) {
	if (!file) {
		throw new Error("No file provided");
	}
	if (file.size === 0) {
		throw new Error("File is empty");
	}

	if (file.size > MAX_FILE_SIZE) {
		throw new Error(
			`File size exceeds the maximum limit of ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB`,
		);
	}

	if (!turnstileToken) {
		throw new Error("Turnstile verification failed");
	}

	const headers: Record<string, string> = {};
	if (API_KEY) {
		headers["Authorization"] = `Bearer ${API_KEY}`;
	}

	return client.upload.$post(
		{
			form: { file, turnstileToken },
		},
		{
			headers,
		},
	);
}

export function validateCode(code: string) {
	if (!code) {
		throw new Error("No code provided");
	}
	if (code.length > 6 || code.length < 6) {
		throw new Error("invalid code");
	}

	return client.verify[":code"].$get({
		param: {
			code,
		},
	});
}

export function downloadFile(code: string) {
	if (!code) {
		throw new Error("No code provided");
	}
	if (code.length > 6 || code.length < 6) {
		throw new Error("invalid code");
	}

	return client.download[":code"].$get({
		param: {
			code,
		},
	});
}

export default client;
