import type { ReadableStream } from "node:stream/web";

export type ArtifactMetadata = {
	size: number;
	durationMs?: number;
	tag?: string;
};

export type ArtifactInfo = {
	metadata: ArtifactMetadata;
	body?: ReadableStream<Uint8Array>;
};

export type ArtifactQueryResult = {
	[hash: string]: ArtifactMetadata | null;
};

export type ArtifactScope = {
	teamId?: string;
	slug?: string;
};

export type ArtifactPutOptions = {
	metadata: ArtifactMetadata;
	body: ReadableStream<Uint8Array>;
};

export interface StorageProvider {
	head(hash: string, scope?: ArtifactScope): Promise<ArtifactMetadata | null>;
	get(hash: string, scope?: ArtifactScope): Promise<ArtifactInfo | null>;
	put(
		hash: string,
		options: ArtifactPutOptions,
		scope?: ArtifactScope,
	): Promise<void>;
	query(hashes: string[], scope?: ArtifactScope): Promise<ArtifactQueryResult>;
}

export type StorageProviderFactory<TConfig> = (
	config: TConfig,
) => StorageProvider;
