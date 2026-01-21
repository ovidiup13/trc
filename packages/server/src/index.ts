import type { TrcConfig } from "@trc/config";
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
export { createLogger } from "./logger";
export { createStorageProvider } from "./storage";

const getBunServe = (): BunServe | undefined =>
	(globalThis as { Bun?: { serve?: BunServe } }).Bun?.serve;

const getDenoServe = (): DenoServe | undefined =>
	(globalThis as { Deno?: { serve?: DenoServe } }).Deno?.serve;

const isNodeRuntime = (): boolean =>
	typeof process !== "undefined" && !!process.versions?.node;

export const startServer = async (config: TrcConfig): Promise<ServerInfo> => {
	const app = createApp(config);
	const hostname = config.server.host;
	const port = config.server.port;
	const bunServe = getBunServe();

	if (bunServe) {
		const server = bunServe({
			hostname,
			port,
			fetch: app.fetch,
		});
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

	return {
		hostname: resolvedHost,
		port: resolvedPort,
		url: `http://${resolvedHost}:${resolvedPort}`,
	};
};
