import { expect, test } from "vitest";
import { createLogger } from "./index";

test("createLogger sets level", () => {
	const logger = createLogger({ level: "debug" });
	expect(logger.level).toBe("debug");
});
