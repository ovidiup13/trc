import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { createErrorResponse } from "@trc/shared";
import type { ApiJsonResponse, ApiRequestBody } from "@trc/shared";
import type { ArtifactMetadata } from "@trc/storage-core";
import type { Hono } from "hono";
import type { RouteDependencies } from "./types";
import { badRequest, isValidHash, toArtifactHeaders } from "./utils";

export const registerArtifactRoutes = (
	target: Hono,
	{ storage }: RouteDependencies,
): void => {
	target.get("/artifacts/status", (context) => {
		const response: ApiJsonResponse<"/artifacts/status", "get", 200> = {
			status: "enabled",
		};
		return context.json(response);
	});

	target.get("/artifacts/:hash", async (context) => {
		const hash = context.req.param("hash");
		if (!isValidHash(hash)) {
			return badRequest("Invalid artifact hash");
		}
		if (context.req.method === "HEAD") {
			const metadata = await storage.head(hash);
			if (!metadata) {
				return context.json(
					createErrorResponse("not_found", "Artifact not found"),
					404,
				);
			}

			const headers = toArtifactHeaders(metadata);
			return new Response(null, { status: 200, headers });
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

		const response: ApiJsonResponse<"/artifacts/{hash}", "put", 202> = {
			urls: [],
		};
		return context.json(response, 202);
	});

	target.post("/artifacts", async (context) => {
		const payload = (await context.req
			.json()
			.catch(() => null)) as ApiRequestBody<"/artifacts", "post"> | null;
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
		) as ApiJsonResponse<"/artifacts", "post", 200>;

		return context.json(response);
	});
};
