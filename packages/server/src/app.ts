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
	const router = new Hono();
	const hashPattern = /^[a-fA-F0-9]+$/;

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

	const isValidHash = (hash: string): boolean =>
		hash.length > 0 && hashPattern.test(hash);

	const badRequest = (message: string): Response =>
		new Response(JSON.stringify(createErrorResponse("bad_request", message)), {
			status: 400,
			headers: {
				"Content-Type": "application/json",
			},
		});

	const registerRoutes = (target: Hono): void => {
		target.get("/artifacts/status", (context) => {
			return context.json({ status: "enabled" });
		});

		target.on("HEAD", "/artifacts/:hash", async (context: Context) => {
			const hash = context.req.param("hash");
			if (!isValidHash(hash)) {
				return badRequest("Invalid artifact hash");
			}
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

		target.get("/artifacts/:hash", async (context) => {
			const hash = context.req.param("hash");
			if (!isValidHash(hash)) {
				return badRequest("Invalid artifact hash");
			}
			const artifact = await storage.get(hash);
			if (!artifact?.body) {
				return context.json(
					createErrorResponse("not_found", "Artifact not found"),
					404,
				);
			}

			const headers = toArtifactHeaders(artifact.metadata);
			headers.set("Content-Type", "application/octet-stream");
			const body = artifact.body as unknown as ReadableStream;
			return new Response(body, { status: 200, headers });
		});

		target.put("/artifacts/:hash", async (context) => {
			const hash = context.req.param("hash");
			if (!isValidHash(hash)) {
				return badRequest("Invalid artifact hash");
			}
			const contentLength = context.req.header("content-length");
			if (!contentLength) {
				return badRequest("Missing Content-Length");
			}

			const size = Number(contentLength);
			if (!Number.isFinite(size) || size < 0) {
				return badRequest("Invalid Content-Length");
			}

			const durationHeader = context.req.header("x-artifact-duration");
			const durationMs =
				durationHeader === undefined ? undefined : Number(durationHeader);
			if (
				durationMs !== undefined &&
				(!Number.isFinite(durationMs) || durationMs < 0)
			) {
				return badRequest("Invalid x-artifact-duration");
			}

			const tag = context.req.header("x-artifact-tag") ?? undefined;
			const body = context.req.raw.body;
			if (!body) {
				return badRequest("Missing request body");
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

		target.post("/artifacts", async (context) => {
			const payload = await context.req.json().catch(() => null);
			if (!payload || !Array.isArray(payload.hashes)) {
				return badRequest("Invalid request body");
			}

			const hashes = payload.hashes;
			if (
				!hashes.every(
					(hash: unknown) => typeof hash === "string" && isValidHash(hash),
				)
			) {
				return badRequest("Invalid artifact hashes");
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

		target.post("/artifacts/events", async (context) => {
			const payload = await context.req.json().catch(() => null);
			if (!Array.isArray(payload)) {
				return badRequest("Invalid request body");
			}

			const isValidEvent = (event: unknown): boolean => {
				if (typeof event !== "object" || event === null) {
					return false;
				}
				const record = event as Record<string, unknown>;
				const sessionId = record.sessionId;
				const source = record.source;
				const eventType = record.event;
				const hash = record.hash;
				const duration = record.duration;

				const isValidDuration =
					duration === undefined ||
					(typeof duration === "number" && duration >= 0);

				return (
					typeof sessionId === "string" &&
					typeof hash === "string" &&
					isValidHash(hash) &&
					(source === "LOCAL" || source === "REMOTE") &&
					(eventType === "HIT" || eventType === "MISS") &&
					isValidDuration
				);
			};

			if (!payload.every(isValidEvent)) {
				return badRequest("Invalid cache events");
			}

			return new Response(null, { status: 200 });
		});

		target.notFound((context) => {
			return context.json(
				createErrorResponse("not_found", "Route not found"),
				404,
			);
		});
	};

	registerRoutes(router);
	app.route("/", router);
	app.route("/v8", router);

	app.notFound((context) => {
		return context.json(
			createErrorResponse("not_found", "Route not found"),
			404,
		);
	});

	return app;
};
