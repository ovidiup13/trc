import type { ApiRequestBody } from "@trc/shared";
import type { Hono } from "hono";
import type { RouteDependencies } from "./types";
import { badRequest, isValidHash } from "./utils";

type CacheEvent = ApiRequestBody<"/artifacts/events", "post"> extends Array<
	infer T
>
	? T
	: never;

const isValidEvent = (event: unknown): event is CacheEvent => {
	if (typeof event !== "object" || event === null) {
		return false;
	}
	const record = event as Record<string, unknown>;
	const sessionId = record.sessionId;
	const source = record.source;
	const eventType = record.event;
	const hash = record.hash;
	const duration = record.duration;

	const isValidDuration =
		duration === undefined || (typeof duration === "number" && duration >= 0);

	return (
		typeof sessionId === "string" &&
		typeof hash === "string" &&
		isValidHash(hash) &&
		(source === "LOCAL" || source === "REMOTE") &&
		(eventType === "HIT" || eventType === "MISS") &&
		isValidDuration
	);
};

export const registerEventsRoutes = (
	target: Hono,
	_deps: RouteDependencies,
): void => {
	target.post("/artifacts/events", async (context) => {
		const payload = (await context.req
			.json()
			.catch(() => null)) as ApiRequestBody<"/artifacts/events", "post"> | null;
		if (!Array.isArray(payload)) {
			return badRequest("Invalid request body");
		}

		if (!payload.every(isValidEvent)) {
			return badRequest("Invalid cache events");
		}

		return new Response(null, { status: 200 });
	});
};
