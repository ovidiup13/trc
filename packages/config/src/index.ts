import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { z } from "zod";

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
	z.object({
		provider: z.literal("s3"),
		s3: s3StorageSchema,
	}),
	z.object({
		provider: z.literal("artifactory"),
		artifactory: artifactoryStorageSchema,
	}),
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

export const loadConfig = async (filePath: string): Promise<TrcConfig> => {
	const rawConfig = await readFile(filePath, "utf-8");
	const parsed = parse(rawConfig);
	return configSchema.parse(parsed);
};

export const defaultConfigPath = "./trc.yaml";
