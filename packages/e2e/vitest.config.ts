import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		reporters: ["verbose"],
		silent: false,
		passWithNoTests: true,
		printConsoleTrace: true,
	},
});
