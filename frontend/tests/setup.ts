import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
beforeEach(() => { vi.stubGlobal("fetch", () => Promise.reject(new Error("ExternalNetworkForbiddenInTests"))); });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
