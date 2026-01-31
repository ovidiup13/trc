import type { StorageProvider } from "@trc/storage-core";
import type { Logger } from "../logger";

export type RouteDependencies = {
	storage: StorageProvider;
	logger: Logger;
};
