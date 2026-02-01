import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { loadConfig, parseConfig } from "./index";

const writeTempConfig = async (contents: string): Promise<string> => {
	const filePath = join(tmpdir(), `trc-config-${randomUUID()}.yaml`);
	await writeFile(filePath, contents);
	return filePath;
};

test("loads config with server defaults", async () => {
	const filePath = await writeTempConfig(
		"auth:\n  jwt:\n    secret: test\nstorage:\n  provider: local\n  local:\n    rootDir: /tmp/trc\n",
	);
	const config = await loadConfig(filePath);

	expect(config.server.host).toBe("0.0.0.0");
	expect(config.server.port).toBe(3000);
	expect(config.logging.level).toBe("info");
});

test("parseConfig parses raw yaml", () => {
	const config = parseConfig(
		"auth:\n  jwt:\n    secret: test\nstorage:\n  provider: local\n  local:\n    rootDir: /tmp/trc\n",
		"TRC_CONFIG",
	);

	expect(config.storage.provider).toBe("local");
});

test("parseConfig parses s3 storage", () => {
	const config = parseConfig(
		"auth:\n  jwt:\n    secret: test\nstorage:\n  provider: s3\n  s3:\n    region: us-east-1\n    bucket: trc-cache\n    accessKeyId: test\n    secretAccessKey: test-secret\n",
		"TRC_CONFIG",
	);

	expect(config.storage.provider).toBe("s3");
	if (config.storage.provider !== "s3") {
		throw new Error("Expected s3 storage provider");
	}
	expect(config.storage.s3.forcePathStyle).toBe(false);
});

test("parseConfig resolves s3 env vars", () => {
	const envBackup = {
		CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
		CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
		CLOUDFLARE_R2_ENDPOINT: process.env.CLOUDFLARE_R2_ENDPOINT,
		CLOUDFLARE_R2_REGION: process.env.CLOUDFLARE_R2_REGION,
	};
	process.env.CLOUDFLARE_ACCOUNT_ID = "account";
	process.env.CLOUDFLARE_API_TOKEN = "token";
	process.env.CLOUDFLARE_R2_ENDPOINT = "http://localhost:9000";
	process.env.CLOUDFLARE_R2_REGION = "auto";

	try {
		const config = parseConfig(
			"auth:\n  jwt:\n    secret: test\nstorage:\n  provider: s3\n  s3:\n    endpoint: $CLOUDFLARE_R2_ENDPOINT\n    region: $CLOUDFLARE_R2_REGION\n    bucket: trc-cache\n    accessKeyId: $CLOUDFLARE_ACCOUNT_ID\n    secretAccessKey: $CLOUDFLARE_API_TOKEN\n",
			"TRC_CONFIG",
		);

		if (config.storage.provider !== "s3") {
			throw new Error("Expected s3 storage provider");
		}
		expect(config.storage.s3.endpoint).toBe("http://localhost:9000");
		expect(config.storage.s3.region).toBe("auto");
		expect(config.storage.s3.accessKeyId).toBe("account");
		expect(config.storage.s3.secretAccessKey).toBe("token");
	} finally {
		process.env.CLOUDFLARE_ACCOUNT_ID = envBackup.CLOUDFLARE_ACCOUNT_ID;
		process.env.CLOUDFLARE_API_TOKEN = envBackup.CLOUDFLARE_API_TOKEN;
		process.env.CLOUDFLARE_R2_ENDPOINT = envBackup.CLOUDFLARE_R2_ENDPOINT;
		process.env.CLOUDFLARE_R2_REGION = envBackup.CLOUDFLARE_R2_REGION;
	}
});
