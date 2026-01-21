import { parse, stringify } from "yaml";
import { ZodError, z } from "zod";

const serverSchema = z.object({
	host: z.string().default("0.0.0.0"),
	port: z.number().int().min(1).max(65535).default(3000),
});

const authSchema = z.object({
	jwt: z.object({
		secret: z.string().min(1),
	}),
});

const loggingSchema = z.object({
	level: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]),
});

const localStorageSchema = z.object({
	rootDir: z.string().min(1),
});

const s3StorageSchema = z.object({
	endpoint: z.string().url().optional(),
	region: z.string().min(1),
	bucket: z.string().min(1),
	accessKeyId: z.string().min(1),
	secretAccessKey: z.string().min(1),
	forcePathStyle: z.boolean().default(false),
});

const artifactoryStorageSchema = z.object({
	baseUrl: z.url(),
	repository: z.string().min(1),
	accessToken: z.string().min(1),
});

const storageSchema = z.discriminatedUnion("provider", [
	z.object({
		provider: z.literal("local"),
		local: localStorageSchema,
	}),
	// coming soon
	// z.object({
	// 	provider: z.literal("s3"),
	// 	s3: s3StorageSchema,
	// }),
	// z.object({
	// 	provider: z.literal("artifactory"),
	// 	artifactory: artifactoryStorageSchema,
	// }),
]);

const configSchema = z.object({
	server: serverSchema.default({
		host: "0.0.0.0",
		port: 3000,
	}),
	logging: loggingSchema.default({
		level: "info",
	}),
	auth: authSchema,
	storage: storageSchema,
});

export type TrcConfig = z.infer<typeof configSchema>;

export type ConfigIssue = {
	path: string;
	message: string;
};

type DenoRuntime = {
	readTextFile: (path: string | URL) => Promise<string>;
};

const getDenoRuntime = (): DenoRuntime | undefined =>
	(globalThis as { Deno?: DenoRuntime }).Deno;

export class ConfigError extends Error {
	readonly issues: ConfigIssue[];

	constructor(message: string, issues: ConfigIssue[]) {
		super(message);
		this.name = "ConfigError";
		this.issues = issues;
	}
}

const formatIssuePath = (path: Array<string | number | symbol>): string =>
	path.length ? path.map((segment) => segment.toString()).join(".") : "(root)";

const formatZodIssues = (error: ZodError): ConfigIssue[] =>
	error.issues.map((issue) => ({
		path: formatIssuePath(issue.path),
		message: issue.message,
	}));

const formatYamlIssue = (error: unknown): ConfigIssue[] => {
	if (error instanceof Error) {
		return [{ path: "(yaml)", message: error.message }];
	}

	return [{ path: "(yaml)", message: "Invalid YAML" }];
};

const formatReadIssue = (error: unknown): ConfigIssue[] => {
	if (error instanceof Error) {
		return [{ path: "(file)", message: error.message }];
	}

	return [{ path: "(file)", message: "Unable to read config file" }];
};

const readConfigFile = async (filePath: string): Promise<string> => {
	const deno = getDenoRuntime();
	if (deno?.readTextFile) {
		return deno.readTextFile(filePath);
	}

	const { readFile } = await import("node:fs/promises");
	return readFile(filePath, "utf-8");
};

export const loadConfig = async (filePath: string): Promise<TrcConfig> => {
	let rawConfig: string;
	try {
		rawConfig = await readConfigFile(filePath);
	} catch (error) {
		throw new ConfigError(
			`Unable to read config file: ${filePath}`,
			formatReadIssue(error),
		);
	}

	let parsed: unknown;
	try {
		parsed = parse(rawConfig);
	} catch (error) {
		throw new ConfigError(
			"Invalid YAML in config file",
			formatYamlIssue(error),
		);
	}

	try {
		return configSchema.parse(parsed);
	} catch (error) {
		if (error instanceof ZodError) {
			throw new ConfigError("Invalid config file", formatZodIssues(error));
		}
		throw error;
	}
};

export const serializeConfig = (config: TrcConfig): string => stringify(config);

export const defaultConfigPath = "./trc.yaml";
