import type { TrcConfig } from "@trc/config";
import type { Logger } from "@trc/logger";
import { createLogger } from "@trc/logger";
import { createErrorResponse } from "@trc/shared";
import type { StorageProvider } from "@trc/storage-core";
import { Hono, type MiddlewareHandler } from "hono";
import { createAuthMiddleware } from "./auth";
import { registerRoutes } from "./routes";
import type { RouteDependencies } from "./routes/types";
import { createStorageProvider } from "./storage";

export type AppDependencies = RouteDependencies & {
	authMiddleware: MiddlewareHandler;
};

const createDependencies = (
	config: TrcConfig,
	overrides: Partial<AppDependencies>,
): AppDependencies => {
	const storage: StorageProvider =
		overrides.storage ?? createStorageProvider(config);
	const logger: Logger =
		overrides.logger ??
		createLogger({
			level: config.logging.level,
			pretty: config.logging.pretty,
			file: config.logging.file,
		});
	const authMiddleware =
		overrides.authMiddleware ?? createAuthMiddleware(config.auth, logger);

	return {
		storage,
		logger,
		authMiddleware,
	};
};

export const createApp = (
	config: TrcConfig,
	overrides: Partial<AppDependencies> = {},
): Hono => {
	const { storage, logger, authMiddleware } = createDependencies(
		config,
		overrides,
	);
	const app = new Hono();
	const router = new Hono();

	app.use("*", async (context, next) => {
		const start = performance.now();
		await next();
		const durationMs = Math.round(performance.now() - start);
		logger.info(
			{
				method: context.req.method,
				path: context.req.path,
				status: context.res.status,
				durationMs,
			},
			"request",
		);
	});

	app.use("*", authMiddleware);

	registerRoutes(router, { storage, logger });
	app.route("/", router);
	app.route("/v8", router);

	app.notFound((context) => {
		return context.json(
			createErrorResponse("not_found", "Route not found"),
			404,
		);
	});

	return app;
};
