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
	endpoint: z.url().optional(),
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
	z.object({
		provider: z.literal("s3"),
		s3: s3StorageSchema,
	}),
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

type DenoEnvRuntime = {
	Deno?: {
		env?: {
			get?: (key: string) => string | undefined;
		};
	};
};

const getEnvValue = (key: string): string | undefined => {
	if (typeof process !== "undefined" && process.env) {
		return process.env[key];
	}
	const deno = (globalThis as DenoEnvRuntime).Deno;
	if (deno?.env?.get) {
		return deno.env.get(key);
	}
	return undefined;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	Boolean(value) && typeof value === "object" && !Array.isArray(value);

const resolveS3Env = (rawConfig: unknown, sourceLabel: string): unknown => {
	if (!isPlainObject(rawConfig)) {
		return rawConfig;
	}
	const storage = rawConfig.storage;
	if (!isPlainObject(storage) || storage.provider !== "s3") {
		return rawConfig;
	}
	const s3Config = storage.s3;
	if (!isPlainObject(s3Config)) {
		return rawConfig;
	}

	const issues: ConfigIssue[] = [];
	for (const [key, value] of Object.entries(s3Config)) {
		if (typeof value !== "string" || !value.startsWith("$")) {
			continue;
		}
		const envKey = value.slice(1);
		if (!envKey) {
			issues.push({
				path: `storage.s3.${key}`,
				message: "Missing environment variable name",
			});
			continue;
		}
		const envValue = getEnvValue(envKey);
		if (envValue === undefined) {
			issues.push({
				path: `storage.s3.${key}`,
				message: `Missing environment variable: ${envKey}`,
			});
			continue;
		}
		s3Config[key] = envValue;
	}

	if (issues.length) {
		throw new ConfigError(`Invalid ${sourceLabel}`, issues);
	}

	return rawConfig;
};

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

const parseConfigString = (
	rawConfig: string,
	sourceLabel: string,
): TrcConfig => {
	let parsed: unknown;
	try {
		parsed = parse(rawConfig);
	} catch (error) {
		throw new ConfigError(
			`Invalid YAML in ${sourceLabel}`,
			formatYamlIssue(error),
		);
	}

	try {
		const resolved = resolveS3Env(parsed, sourceLabel);
		return configSchema.parse(resolved);
	} catch (error) {
		if (error instanceof ZodError) {
			throw new ConfigError(`Invalid ${sourceLabel}`, formatZodIssues(error));
		}
		throw error;
	}
};

const readConfigFile = async (filePath: string): Promise<string> => {
	const deno = getDenoRuntime();
	if (deno?.readTextFile) {
		return deno.readTextFile(filePath);
	}

	const { readFile } = await import("node:fs/promises");
	return readFile(filePath, "utf-8");
};

export const parseConfig = (
	rawConfig: string,
	sourceLabel = "config",
): TrcConfig => parseConfigString(rawConfig, sourceLabel);

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

	return parseConfigString(rawConfig, "config file");
};

export const serializeConfig = (config: TrcConfig): string => stringify(config);

export const defaultConfigPath = "./trc.yaml";
