import { defaultConfigPath, loadConfig } from "@trc/config";
import { createApp } from "./app";

const configPath = process.env.TRC_CONFIG ?? defaultConfigPath;
const config = await loadConfig(configPath);
const app = createApp(config);

const server = Bun.serve({
	hostname: config.server.host,
	port: config.server.port,
	fetch: app.fetch,
});

process.stdout.write(
	`TRC server running on http://${server.hostname}:${server.port}\n`,
);
