import type { TrcConfig } from "@trc/config";
import { createLocalProvider } from "@trc/provider-local";
import { createS3Provider } from "@trc/provider-s3";
import type { StorageProvider } from "@trc/storage-core";

export const createStorageProvider = (config: TrcConfig): StorageProvider => {
	if (config.storage.provider === "local") {
		return createLocalProvider(config.storage.local);
	}
	const envAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
	const envSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
	if (envAccessKeyId && envSecretAccessKey) {
		console.info(
			"Using AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY from environment; overriding config storage.s3 credentials.",
		);
		return createS3Provider({
			...config.storage.s3,
			accessKeyId: envAccessKeyId,
			secretAccessKey: envSecretAccessKey,
		});
	}
	return createS3Provider(config.storage.s3);
};
