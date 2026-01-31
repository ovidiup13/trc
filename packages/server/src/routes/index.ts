import { createErrorResponse } from "@trc/shared";
import type { Hono } from "hono";
import { registerArtifactRoutes } from "./artifacts";
import { registerEventsRoutes } from "./events";
import type { RouteDependencies } from "./types";

export const registerRoutes = (target: Hono, deps: RouteDependencies): void => {
	registerArtifactRoutes(target, deps);
	registerEventsRoutes(target, deps);

	target.notFound((context) => {
		return context.json(
			createErrorResponse("not_found", "Route not found"),
			404,
		);
	});
};
