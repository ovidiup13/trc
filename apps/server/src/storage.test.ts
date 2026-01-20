import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import type { TrcConfig } from "@trc/config";
import { createStorageProvider } from "./storage";

const createConfig = async (): Promise<TrcConfig> => {
	const rootDir = await mkdtemp(join(tmpdir(), "trc-storage-"));
	return {
		server: {
			host: "0.0.0.0",
			port: 3000,
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
