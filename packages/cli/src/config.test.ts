import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { loadResolvedConfig, resolveConfigInput } from "./config";

const sampleConfig =
	"auth:\n  jwt:\n    secret: test\nstorage:\n  provider: local\n  local:\n    rootDir: /tmp/trc\n";

const writeTempConfig = async (contents: string): Promise<string> => {
	const filePath = join(tmpdir(), `trc-config-${randomUUID()}.yaml`);
	await writeFile(filePath, contents);
	return filePath;
};

test("resolveConfigInput prefers TRC_CONFIG", () => {
	const env: NodeJS.ProcessEnv = {
		TRC_CONFIG: sampleConfig,
		TRC_CONFIG_PATH: "/tmp/trc.yaml",
	};
	const result = resolveConfigInput({ config: "/opt/trc.yaml" }, env);

	expect(result.input).toEqual({ kind: "raw", value: sampleConfig });
	expect(result.warnings).toEqual([
		"Warning: TRC_CONFIG is set; ignoring TRC_CONFIG_PATH",
		"Warning: TRC_CONFIG is set; ignoring --config",
	]);
});

test("resolveConfigInput uses TRC_CONFIG_PATH", () => {
	const env: NodeJS.ProcessEnv = { TRC_CONFIG_PATH: "/tmp/trc.yaml" };
	const result = resolveConfigInput({ config: "/opt/trc.yaml" }, env);

	expect(result.input).toEqual({ kind: "path", value: "/tmp/trc.yaml" });
	expect(result.warnings).toEqual([
		"Warning: TRC_CONFIG_PATH is set; ignoring --config",
	]);
});

test("loadResolvedConfig parses TRC_CONFIG", async () => {
	const resolved = resolveConfigInput(
		{},
		{ TRC_CONFIG: sampleConfig } as NodeJS.ProcessEnv,
	);
	const config = await loadResolvedConfig(resolved.input);

	expect(config.storage.provider).toBe("local");
});

test("loadResolvedConfig loads config from path", async () => {
	const filePath = await writeTempConfig(sampleConfig);
	const resolved = resolveConfigInput(
		{},
		{ TRC_CONFIG_PATH: filePath } as NodeJS.ProcessEnv,
	);
	const config = await loadResolvedConfig(resolved.input);

	expect(config.storage.provider).toBe("local");
});
