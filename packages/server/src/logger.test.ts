import { expect, test } from "vitest";
import { createLogger } from "./logger";

test("createLogger sets level", () => {
	const logger = createLogger("debug");
	expect(logger.level).toBe("debug");
});
