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
