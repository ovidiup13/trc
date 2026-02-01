import { createErrorResponse } from "@trc/shared";
import type { ArtifactMetadata, ArtifactScope } from "@trc/storage-core";

const hashPattern = /^[a-fA-F0-9]+$/;

export const isValidHash = (hash: string): boolean =>
	hash.length > 0 && hashPattern.test(hash);

export const badRequest = (message: string): Response =>
	new Response(JSON.stringify(createErrorResponse("bad_request", message)), {
		status: 400,
		headers: {
			"Content-Type": "application/json",
		},
	});

export const toArtifactHeaders = (metadata: ArtifactMetadata): Headers => {
	const headers = new Headers({
		"Content-Length": metadata.size.toString(),
	});

	if (metadata.durationMs !== undefined) {
		headers.set("x-artifact-duration", metadata.durationMs.toString());
	}

	if (metadata.tag) {
		headers.set("x-artifact-tag", metadata.tag);
	}

	return headers;
};

const normalizeQueryValue = (value: string | null): string | undefined => {
	if (!value) {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

export const getArtifactScope = (requestUrl: string): ArtifactScope => {
	const { searchParams } = new URL(requestUrl);
	return {
		teamId: normalizeQueryValue(searchParams.get("teamId")),
		slug: normalizeQueryValue(searchParams.get("slug")),
	};
};
