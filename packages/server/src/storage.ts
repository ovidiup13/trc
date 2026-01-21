import type { TrcConfig } from "@trc/config";
import { createLocalProvider } from "@trc/provider-local";
import type { StorageProvider } from "@trc/storage-core";

export const createStorageProvider = (config: TrcConfig): StorageProvider => {
	return createLocalProvider(config.storage.local);
};
