import "server-only";
export class ReviewError extends Error {
 constructor(readonly status: number, readonly code: string) { super(code); }
}
export function requireReview(value: unknown, status: number, code: string): asserts value {
 if (!value) throw new ReviewError(status, code);
}
