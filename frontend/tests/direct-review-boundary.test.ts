// @vitest-environment node
import { expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { sourceAudit } from "../tools/audit-review.mjs";
import { REVIEW_ROUTES } from "@/shared/review/model";
it("physical source boundary resolver rejects backend, outside imports, signers and client/server mixing", () => {
 expect(sourceAudit()).toMatchObject({ frontendOutsideImports: 0, forbiddenOwnCode: 0, serverMarkers: "PASS" });
});
it("each intended route has one explicit review module; no review catch-all or server action", async () => {
 for (const route of REVIEW_ROUTES) {
  const rel = route.path.replace(":batteryId", "[batteryId]").replace(":operationId", "[operationId]");
  const text = await readFile(new URL("../src/app" + rel + "/route.review.ts", import.meta.url), "utf8");
  expect(text).toContain('import "server-only"'); expect(text).toContain("directReviewRoute"); expect(text).not.toContain("use server");
 }
 const dir = new URL("../src/server/direct-review/", import.meta.url);
 for (const file of (await readdir(dir)).filter(f => /\.(ts|tsx)$/.test(f))) expect(await readFile(new URL(file, dir), "utf8")).not.toMatch(/["']use server["']/);
});
it("evidence page has no upload, file, URL or searchParams selector", async () => {
 const text = await readFile(new URL("../src/app/review/evidence/page.review.tsx", import.meta.url), "utf8");
 expect(text).toContain("function Page()"); expect(text).not.toMatch(/searchParams|type=["']file|input|request\.url/);
});
