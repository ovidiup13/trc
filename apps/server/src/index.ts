import { Hono } from "hono";
import { defaultConfigPath, loadConfig } from "@trc/config";
import { createErrorResponse } from "@trc/shared";

const configPath = process.env.TRC_CONFIG ?? defaultConfigPath;
const config = await loadConfig(configPath);

const app = new Hono();

app.get("/artifacts/status", (context) => {
	return context.json({ status: "disabled" });
});

app.notFound((context) => {
	return context.json(createErrorResponse("not_found", "Route not found"), 404);
});

const server = Bun.serve({
	hostname: config.server.host,
	port: config.server.port,
	fetch: app.fetch,
});

process.stdout.write(
	`TRC server running on http://${server.hostname}:${server.port}\n`,
);
