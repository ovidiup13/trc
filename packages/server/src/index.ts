import type { TrcConfig } from "@trc/config";
import { createLogger } from "@trc/logger";
import { createApp } from "./app";

type BunServe = (options: {
	fetch: (request: Request) => Response | Promise<Response>;
	hostname?: string;
	port?: number;
}) => { hostname: string; port: number };

type DenoServe = (
	options: { hostname?: string; port?: number },
	handler: (request: Request) => Response | Promise<Response>,
) => unknown;

export type ServerInfo = {
	hostname: string;
	port: number;
	url: string;
};

export { createApp } from "./app";
export { createAuthMiddleware } from "./auth";
export { createLogger } from "@trc/logger";
export { createStorageProvider } from "./storage";

const getBunServe = (): BunServe | undefined =>
	(globalThis as { Bun?: { serve?: BunServe } }).Bun?.serve;

const getDenoServe = (): DenoServe | undefined =>
	(globalThis as { Deno?: { serve?: DenoServe } }).Deno?.serve;

const isNodeRuntime = (): boolean =>
	typeof process !== "undefined" && !!process.versions?.node;

export const startServer = async (config: TrcConfig): Promise<ServerInfo> => {
	const logger = createLogger({
		level: config.logging.level,
		pretty: config.logging.pretty,
		file: config.logging.file,
	});
	const app = createApp(config, { logger });
	const hostname = config.server.host;
	const port = config.server.port;
	const bunServe = getBunServe();
	const storage = config.storage;
	const storageDetails =
		storage.provider === "local"
			? { rootDir: storage.local.rootDir }
			: {
					endpoint: storage.s3.endpoint,
					region: storage.s3.region,
					bucket: storage.s3.bucket,
					forcePathStyle: storage.s3.forcePathStyle,
				};

	if (bunServe) {
		const server = bunServe({
			hostname,
			port,
			fetch: app.fetch,
		});
		logger.info(
			{
				hostname: server.hostname,
				port: server.port,
				url: `http://${server.hostname}:${server.port}`,
				loggingLevel: config.logging.level,
				storageProvider: storage.provider,
				storage: storageDetails,
			},
			"o/ TRC server running",
		);
		return {
			hostname: server.hostname,
			port: server.port,
			url: `http://${server.hostname}:${server.port}`,
		};
	}

	const denoServe = getDenoServe();
	if (denoServe) {
		denoServe(
			{
				hostname,
				port,
			},
			app.fetch,
		);
		logger.info(
			{
				hostname,
				port,
				url: `http://${hostname}:${port}`,
				loggingLevel: config.logging.level,
				storageProvider: storage.provider,
				storage: storageDetails,
			},
			"o/ TRC server running",
		);
		return {
			hostname,
			port,
			url: `http://${hostname}:${port}`,
		};
	}

	if (!isNodeRuntime()) {
		throw new Error("Unsupported runtime for TRC server");
	}

	const { serve } = await import("@hono/node-server");
	const server = serve({
		hostname,
		port,
		fetch: app.fetch,
	});
	const address = server.address();
	const resolvedPort =
		typeof address === "object" && address ? address.port : port;
	const resolvedHost =
		typeof address === "object" && address ? address.address : hostname;

	const url = `http://${resolvedHost}:${resolvedPort}`;
	logger.info(
		{
			hostname: resolvedHost,
			port: resolvedPort,
			url,
			loggingLevel: config.logging.level,
			storageProvider: storage.provider,
			storage: storageDetails,
		},
		"o/ TRC server running",
	);
	return {
		hostname: resolvedHost,
		port: resolvedPort,
		url,
	};
};
