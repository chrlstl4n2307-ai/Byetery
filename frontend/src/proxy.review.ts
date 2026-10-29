import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { safeReviewPath } from "@/server/direct-review/policy";
export function proxy(request: NextRequest) {
 if (!safeReviewPath(request.url)) return NextResponse.json({ error: { code: "NotFound" } }, { status: 404 });
 const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
 const csp = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'; style-src 'self' 'nonce-${nonce}'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`;
 const headers = new Headers(request.headers); headers.set("Content-Security-Policy", csp);
 const response = NextResponse.next({ request: { headers } }); response.headers.set("Content-Security-Policy", csp); response.headers.set("Cache-Control", "private, no-store"); return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
export default proxy;
