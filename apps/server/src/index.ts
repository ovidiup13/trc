import { loadConfig } from "@trc/config";
import { startServer } from "@trc/server";

const configPath = process.env.TRC_CONFIG;
if (!configPath) {
	console.error("Missing config path: TRC_CONFIG");
	process.exit(1);
}

const config = await loadConfig(configPath);
const server = await startServer(config);

process.stdout.write(`TRC server running on ${server.url}\n`);
