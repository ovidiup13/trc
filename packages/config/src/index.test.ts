import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { loadConfig, parseConfig, serializeConfigJson } from "./index";

const writeTempConfig = async (
	contents: string,
	extension = "yaml",
): Promise<string> => {
	const filePath = join(tmpdir(), `trc-config-${randomUUID()}.${extension}`);
	await writeFile(filePath, contents);
	return filePath;
};

const clearEnvKeys = (keys: string[]): Record<string, string | undefined> => {
	const backup: Record<string, string | undefined> = {};
	for (const key of keys) {
		backup[key] = process.env[key];
		delete process.env[key];
	}
	return backup;
};

const restoreEnvKeys = (backup: Record<string, string | undefined>): void => {
	for (const [key, value] of Object.entries(backup)) {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
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

test("parseConfig parses raw json", () => {
	const config = parseConfig(
		'{"auth":{"jwt":{"secret":"test"}},"storage":{"provider":"local","local":{"rootDir":"/tmp/trc"}}}',
		"TRC_CONFIG",
	);

	expect(config.storage.provider).toBe("local");
});

test("loadConfig parses json file", async () => {
	const filePath = await writeTempConfig(
		'{"auth":{"jwt":{"secret":"test"}},"storage":{"provider":"local","local":{"rootDir":"/tmp/trc"}}}',
		"json",
	);
	const config = await loadConfig(filePath);

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
		TRC_STORAGE_PROVIDER: process.env.TRC_STORAGE_PROVIDER,
		STORAGE_S3_BUCKET: process.env.STORAGE_S3_BUCKET,
		STORAGE_S3_REGION: process.env.STORAGE_S3_REGION,
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
		process.env.TRC_STORAGE_PROVIDER = envBackup.TRC_STORAGE_PROVIDER;
		process.env.STORAGE_S3_BUCKET = envBackup.STORAGE_S3_BUCKET;
		process.env.STORAGE_S3_REGION = envBackup.STORAGE_S3_REGION;
	}
});

test("parseConfig applies env overrides", () => {
	const envBackup = {
		TRC_AUTH_JWT_SECRET: process.env.TRC_AUTH_JWT_SECRET,
		TRC_STORAGE_PROVIDER: process.env.TRC_STORAGE_PROVIDER,
		STORAGE_LOCAL_ROOT_DIR: process.env.STORAGE_LOCAL_ROOT_DIR,
		TRC_SERVER_PORT: process.env.TRC_SERVER_PORT,
	};
	process.env.TRC_AUTH_JWT_SECRET = "from-env";
	process.env.TRC_STORAGE_PROVIDER = "local";
	process.env.STORAGE_LOCAL_ROOT_DIR = "/tmp/env-trc";
	process.env.TRC_SERVER_PORT = "4001";

	try {
		const config = parseConfig("{}", "TRC_CONFIG");

		expect(config.auth.jwt.secret).toBe("from-env");
		expect(config.storage.provider).toBe("local");
		if (config.storage.provider !== "local") {
			throw new Error("Expected local storage provider");
		}
		expect(config.storage.local.rootDir).toBe("/tmp/env-trc");
		expect(config.server.port).toBe(4001);
	} finally {
		process.env.TRC_AUTH_JWT_SECRET = envBackup.TRC_AUTH_JWT_SECRET;
		process.env.TRC_STORAGE_PROVIDER = envBackup.TRC_STORAGE_PROVIDER;
		process.env.STORAGE_LOCAL_ROOT_DIR = envBackup.STORAGE_LOCAL_ROOT_DIR;
		process.env.TRC_SERVER_PORT = envBackup.TRC_SERVER_PORT;
	}
});

test("serializeConfigJson outputs json", () => {
	const envBackup = clearEnvKeys([
		"TRC_SERVER_HOST",
		"TRC_SERVER_PORT",
		"TRC_LOGGING_LEVEL",
		"TRC_AUTH_JWT_SECRET",
		"TRC_STORAGE_PROVIDER",
		"STORAGE_LOCAL_ROOT_DIR",
		"STORAGE_S3_ENDPOINT",
		"STORAGE_S3_REGION",
		"STORAGE_S3_BUCKET",
		"STORAGE_S3_ACCESS_KEY_ID",
		"STORAGE_S3_SECRET_ACCESS_KEY",
		"STORAGE_S3_FORCE_PATH_STYLE",
	]);

	try {
		const config = parseConfig(
			"auth:\n  jwt:\n    secret: test\nstorage:\n  provider: local\n  local:\n    rootDir: /tmp/trc\n",
			"TRC_CONFIG",
		);
		const output = serializeConfigJson(config);

		const parsed = JSON.parse(output) as { storage?: { provider?: string } };
		expect(parsed.storage?.provider).toBe("local");
	} finally {
		restoreEnvKeys(envBackup);
	}
});
