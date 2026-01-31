import type { TrcConfig } from "@trc/config";
import { createErrorResponse } from "@trc/shared";
import type { StorageProvider } from "@trc/storage-core";
import { Hono, type MiddlewareHandler } from "hono";
import { createAuthMiddleware } from "./auth";
import type { Logger } from "./logger";
import { createLogger } from "./logger";
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
	const logger: Logger = overrides.logger ?? createLogger(config.logging.level);
	const authMiddleware =
		overrides.authMiddleware ?? createAuthMiddleware(config.auth.jwt.secret);

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
		logger.info({
			method: context.req.method,
			path: context.req.path,
			status: context.res.status,
			durationMs,
		});
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
