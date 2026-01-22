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
