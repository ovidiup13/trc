import type { TrcConfig } from "@trc/config";
import { createLocalProvider } from "@trc/provider-local";
import { createS3Provider } from "@trc/provider-s3";
import type { StorageProvider } from "@trc/storage-core";

export const createStorageProvider = (config: TrcConfig): StorageProvider => {
	if (config.storage.provider === "local") {
		return createLocalProvider(config.storage.local);
	}
	return createS3Provider(config.storage.s3);
};
