import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TrcConfig } from "@trc/config";
import { expect, test } from "vitest";
import { createStorageProvider } from "./storage";

const createConfig = async (): Promise<TrcConfig> => {
	const rootDir = await mkdtemp(join(tmpdir(), "trc-storage-"));
	return {
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
	};
};

test("createStorageProvider returns local provider", async () => {
	const config = await createConfig();
	const provider = createStorageProvider(config);
	expect(provider).toBeDefined();
});

test("createStorageProvider returns s3 provider", async () => {
	const config = await createConfig();
	config.storage = {
		provider: "s3",
		s3: {
			region: "us-east-1",
			bucket: "trc-cache",
			accessKeyId: "test",
			secretAccessKey: "test-secret",
			forcePathStyle: true,
		},
	};
	const provider = createStorageProvider(config);
	expect(provider).toBeDefined();
});
