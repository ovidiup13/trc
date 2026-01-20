import { defaultConfigPath, loadConfig } from "@trc/config";

const configPath = process.env.TRC_CONFIG ?? defaultConfigPath;

await loadConfig(configPath);

process.stdout.write("Config OK\n");
