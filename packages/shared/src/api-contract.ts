import type { components, paths } from "./openapi";

export type ApiPaths = paths;
export type ApiComponents = components;

type ExtractJson<T> = T extends { content: { "application/json": infer R } }
	? R
	: never;

type ExtractResponses<
	P extends keyof ApiPaths,
	M extends keyof ApiPaths[P],
> = ApiPaths[P][M] extends { responses: infer R } ? R : never;

export type ApiJsonResponse<
	P extends keyof ApiPaths,
	M extends keyof ApiPaths[P],
	S extends keyof ExtractResponses<P, M>,
> = ExtractJson<ExtractResponses<P, M>[S]>;

export type ApiRequestBody<
	P extends keyof ApiPaths,
	M extends keyof ApiPaths[P],
> = ApiPaths[P][M] extends { requestBody: infer B }
	? ExtractJson<B>
	: undefined;
