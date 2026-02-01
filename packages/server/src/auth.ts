import type { TrcConfig } from "@trc/config";
import type { Logger } from "@trc/logger";
import { createErrorResponse } from "@trc/shared";
import type { MiddlewareHandler } from "hono";
import { jwtVerify } from "jose";

type AuthConfig = TrcConfig["auth"];

const isValidSharedSecret = (token: string, secret: string): boolean => {
	const encoder = new TextEncoder();
	const tokenBytes = encoder.encode(token);
	const secretBytes = encoder.encode(secret);
	if (tokenBytes.length !== secretBytes.length) {
		return false;
	}
	let mismatch = 0;
	for (let index = 0; index < tokenBytes.length; index += 1) {
		mismatch |= tokenBytes[index] ^ secretBytes[index];
	}
	return mismatch === 0;
};

const reportUnauthorized = (
	context: Parameters<MiddlewareHandler>[0],
	logger: Logger | undefined,
	reason: string,
	message: string,
) => {
	logger?.warn(
		{
			method: context.req.method,
			path: context.req.path,
			reason,
		},
		"Unauthorized request",
	);
	return context.json(createErrorResponse("unauthorized", message), 401);
};

export const createAuthMiddleware = (
	auth: AuthConfig,
	logger?: Logger,
): MiddlewareHandler => {
	const jwtSecret = auth.type === "jwt" ? auth.jwt.secret : undefined;

	return async (context, next) => {
		const authorization = context.req.header("authorization");
		if (!authorization?.startsWith("Bearer ")) {
			return reportUnauthorized(
				context,
				logger,
				"missing_bearer_token",
				"Missing bearer token",
			);
		}

		const token = authorization.slice("Bearer ".length).trim();
		if (auth.type === "jwt") {
			try {
				const secretKey = new TextEncoder().encode(jwtSecret ?? "");
				await jwtVerify(token, secretKey);
			} catch {
				return reportUnauthorized(
					context,
					logger,
					"invalid_token",
					"Invalid token",
				);
			}
		} else if (!isValidSharedSecret(token, auth.sharedSecret.secret)) {
			return reportUnauthorized(
				context,
				logger,
				"invalid_token",
				"Invalid token",
			);
		}

		return next();
	};
};
