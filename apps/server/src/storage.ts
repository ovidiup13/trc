import type { TrcConfig } from "@trc/config";
import { createLocalProvider } from "@trc/provider-local";
import type { StorageProvider } from "@trc/storage-core";

export const createStorageProvider = (config: TrcConfig): StorageProvider => {
	switch (config.storage.provider) {
		case "local":
			return createLocalProvider(config.storage.local);
		case "s3":
			throw new Error("S3 provider not implemented yet");
		case "artifactory":
			throw new Error("Artifactory provider not implemented yet");
	}
};
