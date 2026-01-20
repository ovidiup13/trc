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

export type ArtifactPutOptions = {
	metadata: ArtifactMetadata;
	body: ReadableStream<Uint8Array>;
};

export interface StorageProvider {
	head(hash: string): Promise<ArtifactMetadata | null>;
	get(hash: string): Promise<ArtifactInfo | null>;
	put(hash: string, options: ArtifactPutOptions): Promise<void>;
	query(hashes: string[]): Promise<ArtifactQueryResult>;
}

export type StorageProviderFactory<TConfig> = (
	config: TConfig,
) => StorageProvider;
