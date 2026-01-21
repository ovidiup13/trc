import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TrcConfig } from "@trc/config";
import { SignJWT } from "jose";
import { expect, test } from "vitest";
import { createApp } from "./app";

const createToken = async (secret: string): Promise<string> =>
	new SignJWT({ sub: "tester" })
		.setProtectedHeader({ alg: "HS256" })
		.sign(new TextEncoder().encode(secret));

const createConfig = async (rootDir: string): Promise<TrcConfig> => ({
	server: {
		host: "0.0.0.0",
		port: 3000,
	},
	logging: {
		level: "silent",
	},
	auth: {
		jwt: {
			secret: "secret",
		},
	},
	storage: {
		provider: "local",
		local: {
			rootDir,
		},
	},
});

test("integration flow for artifacts", async () => {
	const rootDir = await mkdtemp(join(tmpdir(), "trc-api-"));
	try {
		const config = await createConfig(rootDir);
		const app = createApp(config);
		const token = await createToken(config.auth.jwt.secret);
		const headers = {
			authorization: `Bearer ${token}`,
		};

		const statusResponse = await app.request("/artifacts/status", { headers });
		expect(statusResponse.status).toBe(200);
		await expect(statusResponse.json()).resolves.toEqual({ status: "enabled" });

		const v8StatusResponse = await app.request("/v8/artifacts/status", {
			headers,
		});
		expect(v8StatusResponse.status).toBe(200);
		await expect(v8StatusResponse.json()).resolves.toEqual({
			status: "enabled",
		});

		const hash = "abc123";
		const payload = new TextEncoder().encode("hello");
		const putResponse = await app.request(`/artifacts/${hash}`, {
			method: "PUT",
			headers: {
				...headers,
				"content-length": payload.length.toString(),
				"x-artifact-duration": "120",
				"x-artifact-tag": "tag",
			},
			body: payload,
		});
		expect(putResponse.status).toBe(202);

		const headResponse = await app.request(`/artifacts/${hash}`, {
			method: "HEAD",
			headers,
		});
		expect(headResponse.status).toBe(200);
		expect(headResponse.headers.get("content-length")).toBe(
			payload.length.toString(),
		);
		expect(headResponse.headers.get("x-artifact-duration")).toBe("120");
		expect(headResponse.headers.get("x-artifact-tag")).toBe("tag");

		const getResponse = await app.request(`/artifacts/${hash}`, { headers });
		expect(getResponse.status).toBe(200);
		const buffer = await getResponse.arrayBuffer();
		expect(new Uint8Array(buffer)).toEqual(payload);

		const missingHash = "deadbeef";
		const queryResponse = await app.request("/artifacts", {
			method: "POST",
			headers: {
				...headers,
				"content-type": "application/json",
			},
			body: JSON.stringify({ hashes: [hash, missingHash] }),
		});
		expect(queryResponse.status).toBe(200);
		await expect(queryResponse.json()).resolves.toEqual({
			[hash]: {
				size: payload.length,
				taskDurationMs: 120,
				tag: "tag",
			},
			[missingHash]: null,
		});

		const invalidHashResponse = await app.request("/artifacts/invalid-!", {
			headers,
		});
		expect(invalidHashResponse.status).toBe(400);

		const invalidQueryResponse = await app.request("/artifacts", {
			method: "POST",
			headers: {
				...headers,
				"content-type": "application/json",
			},
			body: JSON.stringify({ hashes: ["invalid-!"] }),
		});
		expect(invalidQueryResponse.status).toBe(400);

		const eventsResponse = await app.request("/artifacts/events", {
			method: "POST",
			headers: {
				...headers,
				"content-type": "application/json",
			},
			body: JSON.stringify([]),
		});
		expect(eventsResponse.status).toBe(200);
	} finally {
		await rm(rootDir, { recursive: true, force: true });
	}
});
