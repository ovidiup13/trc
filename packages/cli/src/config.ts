import type { TrcConfig } from "@trc/config";
import { defaultConfigPath, loadConfig, parseConfig } from "@trc/config";

export type ConfigOptions = {
	config?: string;
};

type ResolvedConfigInput =
	| { kind: "raw"; value: string }
	| { kind: "path"; value: string };

export type ResolvedConfig = {
	input: ResolvedConfigInput;
	warnings: string[];
};

export const resolveConfigInput = (
	options: ConfigOptions,
	env: NodeJS.ProcessEnv = process.env,
): ResolvedConfig => {
	const warnings: string[] = [];
	const envConfig = env.TRC_CONFIG;
	const envConfigPath = env.TRC_CONFIG_PATH;

	if (envConfig) {
		if (envConfigPath) {
			warnings.push("Warning: TRC_CONFIG is set; ignoring TRC_CONFIG_PATH");
		}
		if (options.config) {
			warnings.push("Warning: TRC_CONFIG is set; ignoring --config");
		}
		return { input: { kind: "raw", value: envConfig }, warnings };
	}

	if (envConfigPath) {
		if (options.config) {
			warnings.push("Warning: TRC_CONFIG_PATH is set; ignoring --config");
		}
		return { input: { kind: "path", value: envConfigPath }, warnings };
	}

	return {
		input: { kind: "path", value: options.config ?? defaultConfigPath },
		warnings,
	};
};

export const loadResolvedConfig = async (
	resolved: ResolvedConfigInput,
): Promise<TrcConfig> => {
	if (resolved.kind === "raw") {
		return parseConfig(resolved.value, "TRC_CONFIG");
	}

	return loadConfig(resolved.value);
};
