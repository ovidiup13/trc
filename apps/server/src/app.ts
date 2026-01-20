import type { TrcConfig } from "@trc/config";
import { createErrorResponse } from "@trc/shared";
import type { ArtifactMetadata } from "@trc/storage-core";
import { Hono, type Context } from "hono";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { createAuthMiddleware } from "./auth";
import { createLogger } from "./logger";
import { createStorageProvider } from "./storage";

export const createApp = (config: TrcConfig): Hono => {
	const storage = createStorageProvider(config);
	const logger = createLogger(config.logging.level);
	const app = new Hono();

	app.use("*", async (context, next) => {
		const start = performance.now();
		await next();
		const durationMs = Math.round(performance.now() - start);
		logger.info({
			method: context.req.method,
			path: context.req.path,
			status: context.res.status,
			durationMs,
		});
	});

	app.use("*", createAuthMiddleware(config.auth.jwt.secret));

	app.get("/artifacts/status", (context) => {
		return context.json({ status: "enabled" });
	});

	const toArtifactHeaders = (metadata: ArtifactMetadata): Headers => {
		const headers = new Headers({
			"Content-Length": metadata.size.toString(),
		});

		if (metadata.durationMs !== undefined) {
			headers.set("x-artifact-duration", metadata.durationMs.toString());
		}

		if (metadata.tag) {
			headers.set("x-artifact-tag", metadata.tag);
		}

		return headers;
	};

	app.on("HEAD", "/artifacts/:hash", async (context: Context) => {
		const hash = context.req.param("hash");
		const metadata = await storage.head(hash);
		if (!metadata) {
			return context.json(
				createErrorResponse("not_found", "Artifact not found"),
				404,
			);
		}

		const headers = toArtifactHeaders(metadata);
		return new Response(null, { status: 200, headers });
	});

	app.get("/artifacts/:hash", async (context) => {
		const hash = context.req.param("hash");
		const artifact = await storage.get(hash);
		if (!artifact?.body) {
			return context.json(
				createErrorResponse("not_found", "Artifact not found"),
				404,
			);
		}

		const headers = toArtifactHeaders(artifact.metadata);
		const body = artifact.body as unknown as ReadableStream;
		return new Response(body, { status: 200, headers });
	});

	app.put("/artifacts/:hash", async (context) => {
		const hash = context.req.param("hash");
		const contentLength = context.req.header("content-length");
		if (!contentLength) {
			return context.json(
				createErrorResponse("bad_request", "Missing Content-Length"),
				400,
			);
		}

		const size = Number(contentLength);
		if (!Number.isFinite(size) || size < 0) {
			return context.json(
				createErrorResponse("bad_request", "Invalid Content-Length"),
				400,
			);
		}

		const durationHeader = context.req.header("x-artifact-duration");
		const durationMs =
			durationHeader === undefined ? undefined : Number(durationHeader);
		if (
			durationMs !== undefined &&
			(!Number.isFinite(durationMs) || durationMs < 0)
		) {
			return context.json(
				createErrorResponse("bad_request", "Invalid x-artifact-duration"),
				400,
			);
		}

		const tag = context.req.header("x-artifact-tag") ?? undefined;
		const body = context.req.raw.body;
		if (!body) {
			return context.json(
				createErrorResponse("bad_request", "Missing request body"),
				400,
			);
		}

		await storage.put(hash, {
			metadata: {
				size,
				durationMs,
				tag,
			},
			body: body as unknown as WebReadableStream<Uint8Array>,
		});

		return context.json({ urls: [] }, 202);
	});

	app.post("/artifacts", async (context) => {
		const payload = await context.req.json().catch(() => null);
		if (!payload || !Array.isArray(payload.hashes)) {
			return context.json(
				createErrorResponse("bad_request", "Invalid request body"),
				400,
			);
		}

		const hashes = payload.hashes;
		if (!hashes.every((hash: unknown) => typeof hash === "string")) {
			return context.json(
				createErrorResponse("bad_request", "Invalid artifact hashes"),
				400,
			);
		}

		const results = await storage.query(hashes);
		const entries = Object.entries(results) as [
			string,
			ArtifactMetadata | null,
		][];
		const response = Object.fromEntries(
			entries.map(([hash, metadata]) => {
				if (!metadata) {
					return [hash, null] as const;
				}
				return [
					hash,
					{
						size: metadata.size,
						taskDurationMs: metadata.durationMs ?? 0,
						...(metadata.tag ? { tag: metadata.tag } : {}),
					},
				] as const;
			}),
		);

		return context.json(response);
	});

	app.post("/artifacts/events", () => new Response(null, { status: 200 }));

	app.notFound((context) => {
		return context.json(
			createErrorResponse("not_found", "Route not found"),
			404,
		);
	});

	return app;
};
