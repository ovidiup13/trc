import { jwtVerify } from "jose";
import type { MiddlewareHandler } from "hono";
import { createErrorResponse } from "@trc/shared";

export const createAuthMiddleware = (secret: string): MiddlewareHandler => {
	const secretKey = new TextEncoder().encode(secret);

	return async (context, next) => {
		const authorization = context.req.header("authorization");
		if (!authorization?.startsWith("Bearer ")) {
			return context.json(
				createErrorResponse("unauthorized", "Missing bearer token"),
				401,
			);
		}

		const token = authorization.slice("Bearer ".length).trim();
		try {
			await jwtVerify(token, secretKey);
		} catch {
			return context.json(
				createErrorResponse("unauthorized", "Invalid token"),
				401,
			);
		}

		return next();
	};
};
