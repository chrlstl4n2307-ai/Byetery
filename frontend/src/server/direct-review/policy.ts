import "server-only";
import { REVIEW_ROUTES } from "@/shared/review/model";
export function safeReviewPath(url: string): string | null {
 const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
 return path.startsWith("/") && !/%|\\|\/\/|\.\./.test(path) ? path : null;
}
export function routeReview(path: string) {
 return REVIEW_ROUTES.find(r => new RegExp("^" + r.path.replace(":batteryId", "[A-Z0-9-]{1,32}").replace(":operationId", "[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}") + "$").test(path));
}
