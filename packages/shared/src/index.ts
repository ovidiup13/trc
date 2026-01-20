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
