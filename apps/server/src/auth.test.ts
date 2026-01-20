import { SignJWT } from "jose";
import { Hono } from "hono";
import { expect, test } from "vitest";
import { createAuthMiddleware } from "./auth";

const createToken = async (secret: string): Promise<string> => {
	return new SignJWT({ sub: "tester" })
		.setProtectedHeader({ alg: "HS256" })
		.sign(new TextEncoder().encode(secret));
};

test("auth middleware rejects missing token", async () => {
	const app = new Hono();
	app.use("*", createAuthMiddleware("secret"));
	app.get("/", (context) => context.json({ ok: true }));

	const response = await app.request("/");
	expect(response.status).toBe(401);
	await expect(response.json()).resolves.toEqual({
		code: "unauthorized",
		message: "Missing bearer token",
	});
});

test("auth middleware rejects invalid token", async () => {
	const app = new Hono();
	app.use("*", createAuthMiddleware("secret"));
	app.get("/", (context) => context.json({ ok: true }));

	const response = await app.request("/", {
		headers: {
			authorization: "Bearer invalid",
		},
	});
	expect(response.status).toBe(401);
	await expect(response.json()).resolves.toEqual({
		code: "unauthorized",
		message: "Invalid token",
	});
});

test("auth middleware accepts valid token", async () => {
	const secret = "secret";
	const token = await createToken(secret);

	const app = new Hono();
	app.use("*", createAuthMiddleware(secret));
	app.get("/", (context) => context.json({ ok: true }));

	const response = await app.request("/", {
		headers: {
			authorization: `Bearer ${token}`,
		},
	});
	expect(response.status).toBe(200);
	await expect(response.json()).resolves.toEqual({ ok: true });
});
