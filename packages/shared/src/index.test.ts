import { expect, test } from "vitest";
import { createErrorResponse } from "./index";

test("createErrorResponse returns payload", () => {
	expect(createErrorResponse("bad_request", "Missing")).toEqual({
		code: "bad_request",
		message: "Missing",
	});
});
