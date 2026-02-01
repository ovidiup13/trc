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

export type ConfigFormat = "yaml" | "json";

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

const formatJsonIssue = (error: unknown): ConfigIssue[] => {
	if (error instanceof Error) {
		return [{ path: "(json)", message: error.message }];
	}

	return [{ path: "(json)", message: "Invalid JSON" }];
};

const formatReadIssue = (error: unknown): ConfigIssue[] => {
	if (error instanceof Error) {
		return [{ path: "(file)", message: error.message }];
	}

	return [{ path: "(file)", message: "Unable to read config file" }];
};

const parseRawConfig = (
	rawConfig: string,
	sourceLabel: string,
	format: ConfigFormat,
): unknown => {
	if (format === "json") {
		try {
			return JSON.parse(rawConfig) as unknown;
		} catch (error) {
			throw new ConfigError(
				`Invalid JSON in ${sourceLabel}`,
				formatJsonIssue(error),
			);
		}
	}
	try {
		return parse(rawConfig);
	} catch (error) {
		throw new ConfigError(
			`Invalid YAML in ${sourceLabel}`,
			formatYamlIssue(error),
		);
	}
};

const inferFormatFromSource = (
	sourceLabel: string,
): ConfigFormat | undefined => {
	const normalized = sourceLabel.toLowerCase();
	if (normalized.endsWith(".json")) {
		return "json";
	}
	if (normalized.endsWith(".yaml") || normalized.endsWith(".yml")) {
		return "yaml";
	}
	return undefined;
};

const inferFormatFromContent = (rawConfig: string): ConfigFormat => {
	const trimmed = rawConfig.trimStart();
	if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
		return "json";
	}
	return "yaml";
};

const ensureObject = (value: unknown): Record<string, unknown> =>
	isPlainObject(value) ? value : {};

const setNestedValue = (
	target: Record<string, unknown>,
	path: string[],
	value: unknown,
): void => {
	let cursor = target;
	for (let index = 0; index < path.length - 1; index += 1) {
		const segment = path[index];
		const next = cursor[segment];
		if (!isPlainObject(next)) {
			cursor[segment] = {};
		}
		cursor = cursor[segment] as Record<string, unknown>;
	}
	const lastSegment = path[path.length - 1];
	cursor[lastSegment] = value;
};

const parseBoolean = (value: string): boolean | undefined => {
	const normalized = value.trim().toLowerCase();
	if (normalized === "true" || normalized === "1") {
		return true;
	}
	if (normalized === "false" || normalized === "0") {
		return false;
	}
	return undefined;
};

const applyEnvOverrides = (
	rawConfig: unknown,
	sourceLabel: string,
): unknown => {
	const config = ensureObject(rawConfig);
	const issues: ConfigIssue[] = [];

	const applyString = (envKey: string, path: string[]): void => {
		const value = getEnvValue(envKey);
		if (value === undefined) {
			return;
		}
		setNestedValue(config, path, value);
	};

	const applyNumber = (envKey: string, path: string[]): void => {
		const rawValue = getEnvValue(envKey);
		if (rawValue === undefined) {
			return;
		}
		const parsed = Number(rawValue);
		if (!Number.isFinite(parsed)) {
			issues.push({
				path: path.join("."),
				message: `Invalid number in ${envKey}`,
			});
			return;
		}
		setNestedValue(config, path, parsed);
	};

	const applyBooleanValue = (envKey: string, path: string[]): void => {
		const rawValue = getEnvValue(envKey);
		if (rawValue === undefined) {
			return;
		}
		const parsed = parseBoolean(rawValue);
		if (parsed === undefined) {
			issues.push({
				path: path.join("."),
				message: `Invalid boolean in ${envKey}`,
			});
			return;
		}
		setNestedValue(config, path, parsed);
	};

	applyString("TRC_SERVER_HOST", ["server", "host"]);
	applyNumber("TRC_SERVER_PORT", ["server", "port"]);
	applyString("TRC_LOGGING_LEVEL", ["logging", "level"]);
	applyString("TRC_AUTH_JWT_SECRET", ["auth", "jwt", "secret"]);

	const envProvider = getEnvValue("TRC_STORAGE_PROVIDER");
	if (envProvider !== undefined) {
		setNestedValue(config, ["storage", "provider"], envProvider);
	}

	const localRootDir = getEnvValue("STORAGE_LOCAL_ROOT_DIR");
	const s3EnvValues = {
		endpoint: getEnvValue("STORAGE_S3_ENDPOINT"),
		region: getEnvValue("STORAGE_S3_REGION"),
		bucket: getEnvValue("STORAGE_S3_BUCKET"),
		accessKeyId: getEnvValue("STORAGE_S3_ACCESS_KEY_ID"),
		secretAccessKey: getEnvValue("STORAGE_S3_SECRET_ACCESS_KEY"),
		forcePathStyle: getEnvValue("STORAGE_S3_FORCE_PATH_STYLE"),
	};

	const hasLocalEnv = localRootDir !== undefined;
	const hasS3Env = Object.values(s3EnvValues).some(
		(value) => value !== undefined,
	);

	const storage = ensureObject(config.storage);
	const currentProvider =
		typeof storage.provider === "string" ? storage.provider : undefined;
	let provider = envProvider !== undefined ? envProvider : currentProvider;

	if (!provider) {
		if (hasLocalEnv && hasS3Env) {
			issues.push({
				path: "storage.provider",
				message:
					"Storage provider is required when both local and s3 env vars are set",
			});
		} else if (hasLocalEnv) {
			provider = "local";
			setNestedValue(config, ["storage", "provider"], provider);
		} else if (hasS3Env) {
			provider = "s3";
			setNestedValue(config, ["storage", "provider"], provider);
		}
	}

	if (provider === "local" && localRootDir !== undefined) {
		setNestedValue(config, ["storage", "local", "rootDir"], localRootDir);
	}

	if (provider === "s3") {
		if (s3EnvValues.endpoint !== undefined) {
			setNestedValue(
				config,
				["storage", "s3", "endpoint"],
				s3EnvValues.endpoint,
			);
		}
		if (s3EnvValues.region !== undefined) {
			setNestedValue(config, ["storage", "s3", "region"], s3EnvValues.region);
		}
		if (s3EnvValues.bucket !== undefined) {
			setNestedValue(config, ["storage", "s3", "bucket"], s3EnvValues.bucket);
		}
		if (s3EnvValues.accessKeyId !== undefined) {
			setNestedValue(
				config,
				["storage", "s3", "accessKeyId"],
				s3EnvValues.accessKeyId,
			);
		}
		if (s3EnvValues.secretAccessKey !== undefined) {
			setNestedValue(
				config,
				["storage", "s3", "secretAccessKey"],
				s3EnvValues.secretAccessKey,
			);
		}
		if (s3EnvValues.forcePathStyle !== undefined) {
			const parsed = parseBoolean(s3EnvValues.forcePathStyle);
			if (parsed === undefined) {
				issues.push({
					path: "storage.s3.forcePathStyle",
					message: "Invalid boolean in STORAGE_S3_FORCE_PATH_STYLE",
				});
			} else {
				setNestedValue(config, ["storage", "s3", "forcePathStyle"], parsed);
			}
		}
	}

	if (issues.length) {
		throw new ConfigError(`Invalid ${sourceLabel}`, issues);
	}

	return config;
};

const parseConfigString = (
	rawConfig: string,
	sourceLabel: string,
	format?: ConfigFormat,
): TrcConfig => {
	const resolvedFormat = format ?? inferFormatFromSource(sourceLabel);
	let parsed: unknown;
	if (resolvedFormat) {
		parsed = parseRawConfig(rawConfig, sourceLabel, resolvedFormat);
	} else {
		const inferred = inferFormatFromContent(rawConfig);
		if (inferred === "json") {
			let jsonError: ConfigError | undefined;
			try {
				parsed = parseRawConfig(rawConfig, sourceLabel, "json");
			} catch (error) {
				jsonError = error instanceof ConfigError ? error : undefined;
			}
			if (parsed === undefined) {
				try {
					parsed = parseRawConfig(rawConfig, sourceLabel, "yaml");
				} catch (error) {
					if (jsonError) {
						throw jsonError;
					}
					throw error;
				}
			}
		} else {
			parsed = parseRawConfig(rawConfig, sourceLabel, "yaml");
		}
	}

	try {
		const resolved = applyEnvOverrides(
			resolveS3Env(parsed ?? {}, sourceLabel),
			sourceLabel,
		);
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

export const parseConfigYaml = (
	rawConfig: string,
	sourceLabel = "config",
): TrcConfig => parseConfigString(rawConfig, sourceLabel, "yaml");

export const parseConfigJson = (
	rawConfig: string,
	sourceLabel = "config",
): TrcConfig => parseConfigString(rawConfig, sourceLabel, "json");

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

	return parseConfigString(
		rawConfig,
		filePath,
		inferFormatFromSource(filePath),
	);
};

export const serializeConfig = (config: TrcConfig): string => stringify(config);

export const serializeConfigYaml = (config: TrcConfig): string =>
	stringify(config);

export const serializeConfigJson = (config: TrcConfig): string =>
	JSON.stringify(config, null, 2);

export const defaultConfigPath = "./trc.yaml";
