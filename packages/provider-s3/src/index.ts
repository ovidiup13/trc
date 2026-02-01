import { Buffer } from "node:buffer";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import {
	GetObjectCommand,
	HeadObjectCommand,
	PutObjectCommand,
	type PutObjectCommandInput,
	S3Client,
} from "@aws-sdk/client-s3";
import type {
	ArtifactInfo,
	ArtifactMetadata,
	ArtifactPutOptions,
	ArtifactQueryResult,
	ArtifactScope,
	StorageProvider,
} from "@trc/storage-core";

export type S3ProviderConfig = {
	endpoint?: string;
	region: string;
	bucket: string;
	accessKeyId: string;
	secretAccessKey: string;
	forcePathStyle?: boolean;
};

const toWebStream = (body: unknown): WebReadableStream<Uint8Array> => {
	if (body instanceof Readable) {
		return Readable.toWeb(body) as WebReadableStream<Uint8Array>;
	}
	if (body && typeof body === "object" && "getReader" in body) {
		return body as WebReadableStream<Uint8Array>;
	}
	throw new Error("Unsupported S3 body stream");
};

const toSdkBody = (
	stream: WebReadableStream<Uint8Array>,
): PutObjectCommandInput["Body"] => {
	if (typeof Readable.fromWeb === "function") {
		return Readable.fromWeb(
			stream as WebReadableStream<Uint8Array>,
		) as PutObjectCommandInput["Body"];
	}
	return stream as unknown as PutObjectCommandInput["Body"];
};

const readWebStreamToBuffer = async (
	stream: WebReadableStream<Uint8Array>,
): Promise<Buffer> => {
	const reader = stream.getReader();
	const chunks: Buffer[] = [];
	let total = 0;
	while (true) {
		const { value, done } = await reader.read();
		if (done) {
			break;
		}
		if (value) {
			const chunk = Buffer.from(
				value.buffer,
				value.byteOffset,
				value.byteLength,
			);
			chunks.push(chunk);
			total += chunk.byteLength;
		}
	}
	return Buffer.concat(chunks, total);
};

const parseOptionalNumber = (value?: string): number | undefined => {
	if (value === undefined) {
		return undefined;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
};

const parseMetadata = (
	metadata: Record<string, string> | undefined,
	contentLength?: number,
): ArtifactMetadata => {
	const sizeFromMetadata = parseOptionalNumber(metadata?.size);
	const size = sizeFromMetadata ?? contentLength ?? 0;
	const durationMs = parseOptionalNumber(
		metadata?.durationms ?? metadata?.durationMs,
	);
	const tag = metadata?.tag;

	return {
		size,
		...(durationMs === undefined ? {} : { durationMs }),
		...(tag ? { tag } : {}),
	};
};

const keyForScope = (hash: string, scope?: ArtifactScope): string => {
	const teamId = scope?.teamId?.trim();
	const slug = scope?.slug?.trim();
	const teamSegment = teamId && teamId.length > 0 ? teamId : "_";
	const slugSegment = slug && slug.length > 0 ? slug : "_";
	return `${teamSegment}/${slugSegment}/${hash}`;
};

const isNotFoundError = (error: unknown): boolean => {
	if (!error || typeof error !== "object") {
		return false;
	}
	const err = error as {
		name?: string;
		$metadata?: { httpStatusCode?: number };
	};
	return (
		err.name === "NotFound" ||
		err.name === "NoSuchKey" ||
		err.$metadata?.httpStatusCode === 404
	);
};

export const createS3Provider = (config: S3ProviderConfig): StorageProvider => {
	console.log("creating s3 provider", {
		config,
	});

	const client = new S3Client({
		region: config.region,
		endpoint: config.endpoint,
		credentials: {
			accessKeyId: config.accessKeyId,
			secretAccessKey: config.secretAccessKey,
		},
		forcePathStyle: config.forcePathStyle,
	});

	const bucket = config.bucket;

	const head = async (
		hash: string,
		scope?: ArtifactScope,
	): Promise<ArtifactMetadata | null> => {
		try {
			const response = await client.send(
				new HeadObjectCommand({
					Bucket: bucket,
					Key: keyForScope(hash, scope),
				}),
			);
			return parseMetadata(response.Metadata, response.ContentLength);
		} catch (error) {
			if (isNotFoundError(error)) {
				return null;
			}
			throw error;
		}
	};

	return {
		async head(
			hash: string,
			scope?: ArtifactScope,
		): Promise<ArtifactMetadata | null> {
			return head(hash, scope);
		},
		async get(
			hash: string,
			scope?: ArtifactScope,
		): Promise<ArtifactInfo | null> {
			try {
				const response = await client.send(
					new GetObjectCommand({
						Bucket: bucket,
						Key: keyForScope(hash, scope),
					}),
				);
				const metadata = parseMetadata(
					response.Metadata,
					response.ContentLength,
				);
				if (!response.Body) {
					return { metadata };
				}
				return {
					metadata,
					body: toWebStream(response.Body),
				};
			} catch (error) {
				if (isNotFoundError(error)) {
					return null;
				}
				throw error;
			}
		},
		async put(
			hash: string,
			options: ArtifactPutOptions,
			scope?: ArtifactScope,
		): Promise<void> {
			const bodyBuffer = await readWebStreamToBuffer(options.body);
			const metadata: Record<string, string> = {
				size: options.metadata.size.toString(),
			};
			if (options.metadata.durationMs !== undefined) {
				metadata.durationms = options.metadata.durationMs.toString();
			}
			if (options.metadata.tag) {
				metadata.tag = options.metadata.tag;
			}
			await client.send(
				new PutObjectCommand({
					Bucket: bucket,
					Key: keyForScope(hash, scope),
					Body: bodyBuffer,
					ContentLength: bodyBuffer.byteLength,
					Metadata: metadata,
				}),
			);
		},
		async query(
			hashes: string[],
			scope?: ArtifactScope,
		): Promise<ArtifactQueryResult> {
			const entries = await Promise.all(
				hashes.map(async (hash) => [hash, await head(hash, scope)] as const),
			);
			return Object.fromEntries(entries);
		},
	};
};
