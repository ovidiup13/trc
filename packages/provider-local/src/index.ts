import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import type {
	ArtifactInfo,
	ArtifactMetadata,
	ArtifactPutOptions,
	ArtifactQueryResult,
	ArtifactScope,
	StorageProvider,
} from "@trc/storage-core";

export type LocalProviderConfig = {
	rootDir: string;
};

const scopeSegments = (scope?: ArtifactScope): [string, string] => {
	const teamId = scope?.teamId?.trim();
	const slug = scope?.slug?.trim();
	return [
		teamId && teamId.length > 0 ? teamId : "_",
		slug && slug.length > 0 ? slug : "_",
	];
};

const artifactPath = (
	rootDir: string,
	hash: string,
	scope?: ArtifactScope,
): string => {
	const [teamId, slug] = scopeSegments(scope);
	return join(rootDir, teamId, slug, hash);
};

const metadataPath = (
	rootDir: string,
	hash: string,
	scope?: ArtifactScope,
): string => {
	const [teamId, slug] = scopeSegments(scope);
	return join(rootDir, teamId, slug, `${hash}.json`);
};

const isNotFoundError = (error: unknown): boolean =>
	error instanceof Error && "code" in error && error.code === "ENOENT";

const readMetadata = async (
	rootDir: string,
	hash: string,
	scope?: ArtifactScope,
): Promise<ArtifactMetadata | null> => {
	try {
		const raw = await readFile(metadataPath(rootDir, hash, scope), "utf-8");
		return JSON.parse(raw) as ArtifactMetadata;
	} catch (error) {
		if (isNotFoundError(error)) {
			return null;
		}
		throw error;
	}
};

const writeAtomic = async (filePath: string, data: string): Promise<void> => {
	const tempPath = `${filePath}.${randomUUID()}.tmp`;
	await writeFile(tempPath, data, "utf-8");
	await rename(tempPath, filePath);
};

const toWebStream = (
	stream: NodeJS.ReadableStream,
): WebReadableStream<Uint8Array> =>
	Readable.toWeb(stream) as unknown as WebReadableStream<Uint8Array>;

const fromWebStream = (
	stream: WebReadableStream<Uint8Array>,
): NodeJS.ReadableStream =>
	Readable.fromWeb(stream as unknown as WebReadableStream);

const writeStreamAtomic = async (
	filePath: string,
	body: WebReadableStream<Uint8Array>,
): Promise<void> => {
	const tempPath = `${filePath}.${randomUUID()}.tmp`;
	await pipeline(fromWebStream(body), createWriteStream(tempPath));
	await rename(tempPath, filePath);
};

export const createLocalProvider = (
	config: LocalProviderConfig,
): StorageProvider => {
	const { rootDir } = config;

	const ensureRootDir = async (): Promise<void> => {
		await mkdir(rootDir, { recursive: true });
	};

	const ensureScopeDir = async (scope?: ArtifactScope): Promise<void> => {
		const [teamId, slug] = scopeSegments(scope);
		await mkdir(join(rootDir, teamId, slug), { recursive: true });
	};

	return {
		async head(
			hash: string,
			scope?: ArtifactScope,
		): Promise<ArtifactMetadata | null> {
			return readMetadata(rootDir, hash, scope);
		},
		async get(
			hash: string,
			scope?: ArtifactScope,
		): Promise<ArtifactInfo | null> {
			const metadata = await readMetadata(rootDir, hash, scope);
			if (!metadata) {
				return null;
			}

			const filePath = artifactPath(rootDir, hash, scope);
			try {
				await stat(filePath);
			} catch (error) {
				if (isNotFoundError(error)) {
					return null;
				}
				throw error;
			}

			const stream = createReadStream(filePath);
			return {
				metadata,
				body: toWebStream(stream),
			};
		},
		async put(
			hash: string,
			options: ArtifactPutOptions,
			scope?: ArtifactScope,
		): Promise<void> {
			await ensureRootDir();
			await ensureScopeDir(scope);
			const filePath = artifactPath(rootDir, hash, scope);
			await writeStreamAtomic(filePath, options.body);
			const metadataJson = JSON.stringify(options.metadata, null, 2);
			await writeAtomic(metadataPath(rootDir, hash, scope), metadataJson);
		},
		async query(
			hashes: string[],
			scope?: ArtifactScope,
		): Promise<ArtifactQueryResult> {
			const entries = await Promise.all(
				hashes.map(async (hash) => {
					const metadata = await readMetadata(rootDir, hash, scope);
					return [hash, metadata] as const;
				}),
			);
			return Object.fromEntries(entries);
		},
	};
};
