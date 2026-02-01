import type { TrcConfig } from "@trc/config";
import type { Logger } from "@trc/logger";
import type { StorageProvider } from "@trc/storage-core";
import type { MiddlewareHandler } from "hono";
import { expect, test, vi } from "vitest";
import { createApp } from "../app";

const baseConfig: TrcConfig = {
	server: {
		host: "0.0.0.0",
		port: 3000,
	},
	logging: {
		level: "silent",
	},
	auth: {
		type: "jwt",
		jwt: {
			secret: "test-secret",
		},
	},
	storage: {
		provider: "local",
		local: {
			rootDir: "/tmp",
		},
	},
};

const createTestApp = () => {
	const storage: StorageProvider = {
		head: vi.fn(),
		get: vi.fn(),
		put: vi.fn(),
		query: vi.fn(),
	};
	const logger = { info: vi.fn() } as unknown as Logger;
	const authMiddleware: MiddlewareHandler = async (_context, next) => next();
	const app = createApp(baseConfig, { storage, logger, authMiddleware });

	return { app };
};

test("POST /artifacts/events accepts valid events", async () => {
	const { app } = createTestApp();
	const response = await app.request("/artifacts/events", {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify([
			{
				sessionId: "550e8400-e29b-41d4-a716-446655440000",
				source: "LOCAL",
				event: "HIT",
				hash: "abc123",
				duration: 12,
			},
		]),
	});

	expect(response.status).toBe(200);
});

test("POST /artifacts/events rejects invalid payloads", async () => {
	const { app } = createTestApp();
	const response = await app.request("/artifacts/events", {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify([
			{
				sessionId: "invalid",
				source: "REMOTE",
				event: "HIT",
				hash: "not-a-hash!",
			},
		]),
	});

	expect(response.status).toBe(400);
});
