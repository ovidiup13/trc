import pino from "pino";
import pinoPretty from "pino-pretty";

export type Logger = pino.Logger;

export type LoggerOptions = {
	level: string;
	pretty?: boolean;
	file?: string;
};

type DenoEnvRuntime = {
	Deno?: {
		env?: {
			get?: (key: string) => string | undefined;
		};
	};
};

const getEnvValue = (key: string): string | undefined => {
	if (typeof process !== "undefined" && process.env) {
		return process.env[key];
	}
	const deno = (globalThis as DenoEnvRuntime).Deno;
	if (deno?.env?.get) {
		return deno.env.get(key);
	}
	return undefined;
};

const isCi = (): boolean => {
	const value = getEnvValue("CI");
	return value === "true" || value === "1";
};

const isProduction = (): boolean =>
	getEnvValue("NODE_ENV")?.toLowerCase() === "production";

const resolvePretty = (pretty: boolean | undefined): boolean => {
	if (pretty !== undefined) {
		return pretty;
	}
	return !isCi() && !isProduction();
};

const createStreams = (
	pretty: boolean,
	file: string | undefined,
): pino.DestinationStream | pino.StreamEntry[] => {
	const streams: pino.StreamEntry[] = [];
	if (pretty) {
		streams.push({
			stream: pinoPretty({
				colorize: true,
				translateTime: "SYS:standard",
				ignore: "pid,hostname",
			}),
		});
	} else {
		streams.push({ stream: process.stdout });
	}

	if (file) {
		streams.push({
			stream: pino.destination({ dest: file, sync: false }),
		});
	}

	if (streams.length === 1) {
		return streams[0].stream;
	}
	return streams;
};

export const createLogger = (options: LoggerOptions): Logger => {
	const pretty = resolvePretty(options.pretty);
	const streams = createStreams(pretty, options.file);

	return pino(
		{
			level: options.level,
		},
		Array.isArray(streams) ? pino.multistream(streams) : streams,
	);
};
