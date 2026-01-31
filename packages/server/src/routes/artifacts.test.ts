import { ReadableStream } from "node:stream/web";
import type { TrcConfig } from "@trc/config";
import type { StorageProvider } from "@trc/storage-core";
import type { MiddlewareHandler } from "hono";
import { expect, test, vi } from "vitest";
import { createApp } from "../app";
import type { Logger } from "../logger";

const baseConfig: TrcConfig = {
	server: {
		host: "0.0.0.0",
		port: 3000,
	},
	logging: {
		level: "silent",
	},
	auth: {
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

const createTestApp = (overrides?: Partial<StorageProvider>) => {
	const storage: StorageProvider = {
		head: vi.fn(),
		get: vi.fn(),
		put: vi.fn(),
		query: vi.fn(),
		...overrides,
	};
	const logger = { info: vi.fn() } as unknown as Logger;
	const authMiddleware: MiddlewareHandler = async (_context, next) => next();
	const app = createApp(baseConfig, { storage, logger, authMiddleware });

	return { app, storage, logger };
};

test("GET /artifacts/status returns enabled", async () => {
	const { app } = createTestApp();
	const response = await app.request("/artifacts/status");

	expect(response.status).toBe(200);
	await expect(response.json()).resolves.toEqual({ status: "enabled" });
});

test("HEAD /artifacts/:hash returns metadata headers", async () => {
	const { app, storage } = createTestApp();
	storage.head = vi
		.fn()
		.mockResolvedValue({ size: 12, durationMs: 80, tag: "tag" });

	const response = await app.request("/artifacts/abc123", { method: "HEAD" });

	expect(response.status).toBe(200);
	expect(response.headers.get("content-length")).toBe("12");
	expect(response.headers.get("x-artifact-duration")).toBe("80");
	expect(response.headers.get("x-artifact-tag")).toBe("tag");
});

test("GET /artifacts/:hash streams the artifact", async () => {
	const payload = new TextEncoder().encode("hello");
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(payload);
			controller.close();
		},
	});
	const { app, storage } = createTestApp();
	storage.get = vi
		.fn()
		.mockResolvedValue({ metadata: { size: payload.length }, body });

	const response = await app.request("/artifacts/abc123");

	expect(response.status).toBe(200);
	const buffer = await response.arrayBuffer();
	expect(new Uint8Array(buffer)).toEqual(payload);
});

test("PUT /artifacts/:hash stores metadata and body", async () => {
	const payload = new TextEncoder().encode("payload");
	const { app, storage } = createTestApp();

	const response = await app.request("/artifacts/abc123", {
		method: "PUT",
		headers: {
			"content-length": payload.length.toString(),
			"x-artifact-duration": "120",
			"x-artifact-tag": "tag",
		},
		body: payload,
	});

	expect(response.status).toBe(202);
	expect(storage.put).toHaveBeenCalledWith(
		"abc123",
		expect.objectContaining({
			metadata: {
				size: payload.length,
				durationMs: 120,
				tag: "tag",
			},
		}),
	);
});

test("POST /artifacts returns metadata map", async () => {
	const { app, storage } = createTestApp();
	storage.query = vi.fn().mockResolvedValue({
		abc123: { size: 3, durationMs: 42, tag: "tag" },
		deadbeef: null,
	});

	const response = await app.request("/artifacts", {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({ hashes: ["abc123", "deadbeef"] }),
	});

	expect(response.status).toBe(200);
	await expect(response.json()).resolves.toEqual({
		abc123: {
			size: 3,
			taskDurationMs: 42,
			tag: "tag",
		},
		deadbeef: null,
	});
});
