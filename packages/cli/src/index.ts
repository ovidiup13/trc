import { Command } from "commander";
import type { CommanderError } from "commander";
import {
	ConfigError,
	defaultConfigPath,
	loadConfig,
	serializeConfig,
} from "@trc/config";
import { startServer } from "@trc/server";

type CliOptions = {
	config?: string;
	printConfig?: boolean;
	checkConfig?: boolean;
};

const loadVersion = async (): Promise<string> => {
	const packageUrl = new URL("../package.json", import.meta.url);
	const { readFile } = await import("node:fs/promises");
	const raw = await readFile(packageUrl, "utf-8");
	const parsed = JSON.parse(raw) as { version?: string };
	return parsed.version ?? "0.0.0";
};

const printConfigIssues = (error: ConfigError): void => {
	process.stderr.write(`${error.message}\n`);
	for (const issue of error.issues) {
		process.stderr.write(`- ${issue.path}: ${issue.message}\n`);
	}
};

const isCommanderError = (value: unknown): value is CommanderError => {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const record = value as { code?: unknown };
	return (
		typeof record.code === "string" && record.code.startsWith("commander.")
	);
};

const handleError = (error: unknown): void => {
	if (isCommanderError(error)) {
		const exitCode = typeof error.exitCode === "number" ? error.exitCode : 1;
		process.exitCode = exitCode;
		return;
	}
	if (error instanceof ConfigError) {
		printConfigIssues(error);
		process.exitCode = 1;
		return;
	}
	const message = error instanceof Error ? error.message : String(error);
	process.stderr.write(`Error: ${message}\n`);
	process.exitCode = 2;
};

const run = async (): Promise<void> => {
	const version = await loadVersion();
	const program = new Command();

	program
		.name("trc")
		.description("Turborepo remote cache server")
		.option("-c, --config <path>", "Path to config file")
		.option("--print-config", "Print resolved config and exit")
		.option("--check-config", "Validate config and exit")
		.version(version, "-v, --version", "Print version")
		.configureOutput({
			writeOut: (text: string) => process.stdout.write(text),
			writeErr: (text: string) => process.stderr.write(text),
		})
		.exitOverride();

	program.parse(process.argv, { from: "node" });

	const options = program.opts<CliOptions>();

	if (options.printConfig && options.checkConfig) {
		program.error("--print-config and --check-config cannot be used together");
	}

	const envConfigPath = process.env.TRC_CONFIG;
	if (envConfigPath && options.config) {
		process.stderr.write("Warning: TRC_CONFIG is set; ignoring --config\n");
	}
	const configPath = envConfigPath ?? options.config ?? defaultConfigPath;
	const config = await loadConfig(configPath);

	if (options.printConfig) {
		const output = serializeConfig(config);
		process.stdout.write(output.endsWith("\n") ? output : `${output}\n`);
		return;
	}

	if (options.checkConfig) {
		process.stdout.write("Config OK\n");
		return;
	}

	const server = await startServer(config);
	process.stdout.write(`TRC server running on ${server.url}\n`);
};

try {
	await run();
} catch (error) {
	handleError(error);
}
