import { Buffer } from "node:buffer";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { describe, expect, test, vi } from "vitest";

type MockS3Client = {
	config: Record<string, unknown>;
	send: ReturnType<typeof vi.fn>;
};

let lastClient: MockS3Client | undefined;
const getLastClient = (): MockS3Client => {
	if (!lastClient) {
		throw new Error("S3 client was not created");
	}
	return lastClient;
};

vi.mock("@aws-sdk/client-s3", () => {
	class S3Client {
		config: Record<string, unknown>;
		send = vi.fn();
		constructor(config: Record<string, unknown>) {
			this.config = config;
			lastClient = this as MockS3Client;
		}
	}

	class HeadObjectCommand {
		input: Record<string, unknown>;
		constructor(input: Record<string, unknown>) {
			this.input = input;
		}
	}

	class GetObjectCommand {
		input: Record<string, unknown>;
		constructor(input: Record<string, unknown>) {
			this.input = input;
		}
	}

	class PutObjectCommand {
		input: Record<string, unknown>;
		constructor(input: Record<string, unknown>) {
			this.input = input;
		}
	}

	return {
		S3Client,
		HeadObjectCommand,
		GetObjectCommand,
		PutObjectCommand,
	};
});

import {
	GetObjectCommand,
	HeadObjectCommand,
	PutObjectCommand,
} from "@aws-sdk/client-s3";
import { createS3Provider } from "./index";

describe("s3 provider", () => {
	const baseConfig = {
		region: "us-east-1",
		bucket: "trc-cache",
		accessKeyId: "access",
		secretAccessKey: "secret",
		forcePathStyle: true,
	};

	const scope = { teamId: "team-1", slug: "app" };

	test("head returns null for missing objects", async () => {
		const provider = createS3Provider(baseConfig);
		const client = getLastClient();
		client.send.mockImplementation(async (command: unknown) => {
			if (command instanceof HeadObjectCommand) {
				const error = new Error("missing") as Error & { name: string };
				error.name = "NotFound";
				throw error;
			}
			return {};
		});

		const result = await provider.head("missing-hash", scope);
		expect(result).toBeNull();
	});

	test("get returns metadata and body", async () => {
		const provider = createS3Provider(baseConfig);
		const client = getLastClient();
		client.send.mockImplementation(async (command: unknown) => {
			if (command instanceof GetObjectCommand) {
				return {
					Body: Readable.from(["data"]),
					ContentLength: 4,
					Metadata: {
						size: "4",
						durationms: "12",
						tag: "tag-1",
					},
				};
			}
			return {};
		});

		const result = await provider.get("hash-1", scope);
		expect(result?.metadata).toEqual({
			size: 4,
			durationMs: 12,
			tag: "tag-1",
		});
		expect(result?.body).toBeDefined();
	});

	test("put sends metadata", async () => {
		const provider = createS3Provider(baseConfig);
		const client = getLastClient();
		client.send.mockResolvedValue({});

		await provider.put(
			"hash-2",
			{
				metadata: {
					size: 10,
					durationMs: 200,
					tag: "tag-2",
				},
				body: Readable.toWeb(
					Readable.from([Buffer.from("payload")]),
				) as WebReadableStream<Uint8Array>,
			},
			scope,
		);

		expect(client.send).toHaveBeenCalledTimes(1);
		const command = client.send.mock.calls[0]?.[0] as
			| PutObjectCommand
			| undefined;
		expect(command).toBeInstanceOf(PutObjectCommand);
		expect(command?.input).toMatchObject({
			Bucket: "trc-cache",
			Key: "team-1/app/hash-2",
			ContentLength: 7,
			Metadata: {
				size: "10",
				durationms: "200",
				tag: "tag-2",
			},
		});
		expect(Buffer.isBuffer(command?.input.Body)).toBe(true);
	});

	test("query collects results", async () => {
		const provider = createS3Provider(baseConfig);
		const client = getLastClient();
		client.send.mockImplementation(async (command: unknown) => {
			if (command instanceof HeadObjectCommand) {
				const input = command.input as { Key?: string };
				if (input.Key === "team-1/app/hit") {
					return {
						ContentLength: 2,
						Metadata: { size: "2" },
					};
				}
				const error = new Error("missing") as Error & { name: string };
				error.name = "NotFound";
				throw error;
			}
			return {};
		});

		const result = await provider.query(["hit", "miss"], scope);
		expect(result).toEqual({
			hit: { size: 2 },
			miss: null,
		});
	});

	test("client config includes endpoint", () => {
		createS3Provider({
			...baseConfig,
			endpoint: "http://localhost:9000",
		});
		const client = getLastClient();
		expect(client.config).toMatchObject({
			endpoint: "http://localhost:9000",
			region: "us-east-1",
			forcePathStyle: true,
		});
	});
});
