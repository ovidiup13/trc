import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { expect, test } from "vitest";
import { createLocalProvider } from "./index";

const toStream = (data: Uint8Array): WebReadableStream<Uint8Array> =>
	new Blob([
		data.buffer as ArrayBuffer,
	]).stream() as unknown as WebReadableStream<Uint8Array>;

test("stores and retrieves artifacts", async () => {
	const rootDir = await mkdtemp(join(tmpdir(), "trc-local-"));
	try {
		const provider = createLocalProvider({ rootDir });
		const hash = "abc123";
		const payload = new TextEncoder().encode("hello");
		const scope = { teamId: "team-1", slug: "app" };

		await provider.put(
			hash,
			{
				metadata: {
					size: payload.length,
					durationMs: 120,
					tag: "tag",
				},
				body: toStream(payload),
			},
			scope,
		);

		const head = await provider.head(hash, scope);
		expect(head).toEqual({ size: payload.length, durationMs: 120, tag: "tag" });
		expect(await provider.head(hash, { teamId: "other" })).toBeNull();

		const artifact = await provider.get(hash, scope);
		expect(artifact?.metadata).toEqual({
			size: payload.length,
			durationMs: 120,
			tag: "tag",
		});

		if (!artifact?.body) {
			throw new Error("Missing artifact body");
		}

		const buffer = await new Response(
			artifact.body as unknown as ReadableStream,
		).arrayBuffer();
		expect(new Uint8Array(buffer)).toEqual(payload);

		const query = await provider.query([hash, "missing"], scope);
		expect(query[hash]).toEqual({
			size: payload.length,
			durationMs: 120,
			tag: "tag",
		});
		expect(query.missing).toBeNull();
	} finally {
		await rm(rootDir, { recursive: true, force: true });
	}
});
