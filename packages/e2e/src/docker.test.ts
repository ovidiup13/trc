import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { SignJWT } from "jose";
import { expect, test } from "vitest";

const exec = promisify(execFile);

const rootDir = resolve(
	fileURLToPath(new URL(".", import.meta.url)),
	"../../..",
);

const isDockerAvailable = async (): Promise<boolean> => {
	try {
		await exec("docker", ["info"]);
		return true;
	} catch {
		return false;
	}
};

const waitFor = async (
	fn: () => Promise<boolean>,
	retries = 20,
	delayMs = 250,
): Promise<void> => {
	for (let attempt = 0; attempt < retries; attempt += 1) {
		if (await fn()) {
			return;
		}
		await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
	}
	throw new Error("Server did not become ready");
};

test.skipIf(!(await isDockerAvailable()))("docker smoke test", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "trc-e2e-"));
	const configPath = join(tempDir, "trc.yaml");
	const port = 3123;
	const secret = "secret";
	const configContents = `server:\n  host: 0.0.0.0\n  port: 3000\nlogging:\n  level: info\nauth:\n  jwt:\n    secret: ${secret}\nstorage:\n  provider: local\n  local:\n    rootDir: /data\n`;
	await writeFile(configPath, configContents);

	const imageTag = "trc-e2e";
	let containerId = "";
	try {
		await exec("docker", ["build", "-t", imageTag, "."], { cwd: rootDir });
		const runResult = await exec("docker", [
			"run",
			"-d",
			"-p",
			`${port}:3000`,
			"-v",
			`${tempDir}:/config`,
			"-e",
			"TRC_CONFIG=/config/trc.yaml",
			imageTag,
		]);
		containerId = runResult.stdout.trim();

		const token = await new SignJWT({ sub: "tester" })
			.setProtectedHeader({ alg: "HS256" })
			.sign(new TextEncoder().encode(secret));
		const headers = {
			authorization: `Bearer ${token}`,
		};

		await waitFor(async () => {
			try {
				const response = await fetch(
					`http://localhost:${port}/artifacts/status`,
					{
						headers,
					},
				);
				return response.ok;
			} catch {
				return false;
			}
		});

		const hash = "e2e123";
		const payload = new TextEncoder().encode("hello");
		const putResponse = await fetch(
			`http://localhost:${port}/artifacts/${hash}`,
			{
				method: "PUT",
				headers: {
					...headers,
					"content-length": payload.length.toString(),
				},
				body: payload,
			},
		);
		expect(putResponse.status).toBe(202);

		const getResponse = await fetch(
			`http://localhost:${port}/artifacts/${hash}`,
			{ headers },
		);
		expect(getResponse.status).toBe(200);
		const buffer = await getResponse.arrayBuffer();
		expect(new Uint8Array(buffer)).toEqual(payload);
	} finally {
		if (containerId) {
			await exec("docker", ["rm", "-f", containerId]);
		}
		await rm(tempDir, { recursive: true, force: true });
	}
});
