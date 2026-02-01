import { execFile } from "node:child_process";
import {
	appendFile,
	cp,
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rm,
	writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
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
	retries = 30,
	delayMs = 500,
): Promise<void> => {
	for (let attempt = 0; attempt < retries; attempt += 1) {
		if (await fn()) {
			return;
		}
		await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
	}
	throw new Error("Server did not become ready");
};

const getAvailablePort = async (): Promise<number> => {
	const server = createServer();
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => resolve());
	});
	const address = server.address();
	const port =
		typeof address === "object" && address ? address.port : undefined;
	await new Promise<void>((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
	});
	if (!port) {
		throw new Error("Failed to allocate port");
	}
	return port;
};

const execLogged = async (
	command: string,
	args: string[],
	options: { cwd?: string; logPath?: string } = {},
): Promise<{ stdout: string; stderr: string }> => {
	const rendered = [command, ...args].join(" ");
	console.info(`$ ${rendered}`);
	if (options.logPath) {
		await appendFile(options.logPath, `$ ${rendered}\n`, "utf-8");
	}
	try {
		const result = await exec(command, args, {
			cwd: options.cwd,
			maxBuffer: 20 * 1024 * 1024,
		});
		if (result.stdout.trim()) {
			console.info(result.stdout.trim());
			if (options.logPath) {
				await appendFile(options.logPath, result.stdout, "utf-8");
			}
		}
		if (result.stderr.trim()) {
			console.info(result.stderr.trim());
			if (options.logPath) {
				await appendFile(options.logPath, result.stderr, "utf-8");
			}
		}
		return result;
	} catch (error) {
		const execError = error as { stdout?: string; stderr?: string };
		if (execError.stdout?.trim()) {
			console.info(execError.stdout.trim());
			if (options.logPath) {
				await appendFile(options.logPath, execError.stdout, "utf-8");
			}
		}
		if (execError.stderr?.trim()) {
			console.info(execError.stderr.trim());
			if (options.logPath) {
				await appendFile(options.logPath, execError.stderr, "utf-8");
			}
		}
		throw error;
	}
};

const writeEnvFile = async (
	envPath: string,
	values: Record<string, string>,
): Promise<void> => {
	const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
	await writeFile(envPath, `${lines.join("\n")}\n`, "utf-8");
};

const updateTurboConfig = async (
	configPath: string,
	apiUrl: string,
): Promise<void> => {
	const raw = await readFile(configPath, "utf-8");
	const json = JSON.parse(raw) as Record<string, unknown>;
	const remoteCache =
		(typeof json.remoteCache === "object" && json.remoteCache) || {};
	json.remoteCache = {
		...remoteCache,
		enabled: true,
		apiUrl,
	};
	await writeFile(configPath, `${JSON.stringify(json, null, 2)}\n`, "utf-8");
};

const listFiles = async (dirPath: string): Promise<string[]> => {
	const entries = await readdir(dirPath, { withFileTypes: true });
	return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
};

const tailLog = async (filePath: string, limit = 8000): Promise<string> => {
	const contents = await readFile(filePath, "utf-8");
	if (contents.length <= limit) {
		return contents;
	}
	return contents.slice(-limit);
};

test.skipIf(!(await isDockerAvailable()))(
	"docker e2e",
	async () => {
		const artifactsRoot = join(rootDir, ".e2e-artifacts");
		await mkdir(artifactsRoot, { recursive: true });

		const runDir = await mkdtemp(join(tmpdir(), "trc-e2e-"));
		const runId = runDir.split("-").pop() ?? "run";
		const configDir = join(runDir, "config");
		const exampleDir = join(runDir, "examples", "basic");
		const composeEnvPath = join(runDir, "compose.env");
		const composeFile = join(rootDir, "packages/e2e/docker-compose.e2e.yml");
		const secret = "e2e-secret";
		const hostPort = await getAvailablePort();
		const uid = typeof process.getuid === "function" ? process.getuid() : 0;
		const gid = typeof process.getgid === "function" ? process.getgid() : 0;
		const now = new Date();
		const pad = (value: number): string => value.toString().padStart(2, "0");
		const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
		const artifactsRunDir = join(artifactsRoot, `run-${timestamp}-${runId}`);
		const storageDir = join(artifactsRunDir, "server-storage");
		const cacheDir = join(artifactsRunDir, "runner-cache");
		const projectName = `trc-e2e-${timestamp}`;
		const logPath = join(artifactsRunDir, "docker-compose.log");
		const composeArgs = [
			"compose",
			"-f",
			composeFile,
			"--project-name",
			projectName,
			"--env-file",
			composeEnvPath,
		];

		console.info("E2E workspace", {
			runDir,
			artifactsRunDir,
			configDir,
			storageDir,
			cacheDir,
			exampleDir,
			composeFile,
			composeEnvPath,
			projectName,
			logPath,
		});

		let success = false;

		await mkdir(configDir, { recursive: true });
		await mkdir(artifactsRunDir, { recursive: true });
		await mkdir(storageDir, { recursive: true });
		await mkdir(cacheDir, { recursive: true });
		await mkdir(join(runDir, "examples"), { recursive: true });

		await cp(join(rootDir, "examples/basic"), exampleDir, { recursive: true });
		await rm(join(exampleDir, ".turbo"), { recursive: true, force: true });
		await rm(join(exampleDir, "node_modules"), {
			recursive: true,
			force: true,
		});
		await updateTurboConfig(join(exampleDir, "turbo.json"), "http://trc:3000");

		const configContents = `server:\n  host: 0.0.0.0\n  port: 3000\nlogging:\n  level: info\nauth:\n  type: jwt\n  jwt:\n    secret: ${secret}\nstorage:\n  provider: local\n  local:\n    rootDir: /data\n`;
		await writeFile(join(configDir, "trc.yaml"), configContents, "utf-8");

		const token = await new SignJWT({ sub: "e2e" })
			.setProtectedHeader({ alg: "HS256" })
			.sign(new TextEncoder().encode(secret));

		await writeEnvFile(composeEnvPath, {
			E2E_TRC_PORT: hostPort.toString(),
			E2E_CONFIG_DIR: configDir,
			E2E_STORAGE_DIR: storageDir,
			E2E_EXAMPLE_DIR: exampleDir,
			E2E_CACHE_DIR: cacheDir,
			E2E_TURBO_TOKEN: token,
			E2E_UID: uid.toString(),
			E2E_GID: gid.toString(),
		});

		try {
			try {
				await execLogged(
					"docker",
					[
						"compose",
						"--progress=plain",
						...composeArgs.slice(1),
						"build",
						"trc",
						"runner",
					],
					{
						cwd: rootDir,
						logPath,
					},
				);
			} catch (error) {
				const buildLog = await readFile(logPath, "utf-8");
				console.info(buildLog.length > 8000 ? buildLog.slice(-8000) : buildLog);
				throw error;
			}
			await execLogged("docker", [...composeArgs, "up", "-d", "trc"], {
				cwd: rootDir,
				logPath,
			});

			try {
				await waitFor(async () => {
					try {
						const response = await fetch(
							`http://localhost:${hostPort}/artifacts/status`,
							{
								headers: {
									authorization: `Bearer ${token}`,
								},
							},
						);
						return response.ok;
					} catch {
						return false;
					}
				});
			} catch (error) {
				try {
					await execLogged("docker", [...composeArgs, "ps"], {
						cwd: rootDir,
						logPath,
					});
					await execLogged("docker", [...composeArgs, "logs", "trc"], {
						cwd: rootDir,
						logPath,
					});
				} catch {
					// Ignore log collection errors.
				}
				throw error;
			}

			await execLogged("docker", [...composeArgs, "run", "--rm", "runner"], {
				cwd: rootDir,
				logPath,
			});

			const storageFiles = await listFiles(storageDir);
			const storageHashes = new Set(
				storageFiles.filter(
					(name) => !name.endsWith(".json") && !name.endsWith(".tmp"),
				),
			);

			const cacheRoot = join(cacheDir, "cache");
			const cacheFiles = await listFiles(cacheRoot);
			const cacheHashes = new Set(
				cacheFiles
					.filter((name) => name.endsWith(".tar.zst"))
					.map((name) => name.replace(/\.tar\.zst$/, "")),
			);

			console.info("Artifact summary", {
				storageCount: storageHashes.size,
				cacheCount: cacheHashes.size,
				storageSample: Array.from(storageHashes).slice(0, 5),
				cacheSample: Array.from(cacheHashes).slice(0, 5),
			});

			expect(storageHashes.size).toBeGreaterThan(0);
			expect(cacheHashes.size).toBeGreaterThan(0);
			for (const hash of cacheHashes) {
				expect(storageHashes.has(hash)).toBe(true);
			}
			success = true;
		} finally {
			try {
				await execLogged("docker", [...composeArgs, "logs", "trc"], {
					cwd: rootDir,
					logPath,
				});
			} catch {
				// Ignore log collection errors.
			}
			try {
				await execLogged(
					"docker",
					[...composeArgs, "down", "--remove-orphans", "--rmi", "local"],
					{
						cwd: rootDir,
						logPath,
					},
				);
				await execLogged(
					"docker",
					["image", "rm", "-f", `${projectName}-trc`, `${projectName}-runner`],
					{
						cwd: rootDir,
						logPath,
					},
				);
			} catch {
				// Ignore teardown errors to preserve original failure.
			}
			if (!success) {
				try {
					console.info("Docker compose log tail:\n", await tailLog(logPath));
				} catch {
					// Ignore log read errors.
				}
			}
			if (success) {
				await rm(runDir, { recursive: true, force: true });
			} else {
				console.info(`Preserving run directory for inspection: ${runDir}`);
			}
		}
	},
	300_000,
);
