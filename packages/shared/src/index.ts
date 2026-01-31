export type ErrorResponse = {
	code: string;
	message: string;
};

export const createErrorResponse = (
	code: string,
	message: string,
): ErrorResponse => ({
	code,
	message,
});

export type {
	ApiComponents,
	ApiPaths,
	ApiJsonResponse,
	ApiRequestBody,
} from "./api-contract";
export type { components, paths } from "./openapi";
