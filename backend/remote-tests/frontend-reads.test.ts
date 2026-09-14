import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { fixture } from "../src/application/dev-fixture.ts";
test("frontend read projections preserve privacy and backend authority", async (t) => {
  const f = await fixture(),
    { a, b, admin } = f.users,
    id = "BYE-" + randomBytes(8).toString("hex").toUpperCase();
  try {
    await t.test("profile requires live authentication", async () =>
      assert.equal((await f.call(null, "GET", "/api/me")).status, 401),
    );
    await t.test("roles come from database memberships", async () => {
      const r = await f.call(a, "GET", "/api/me");
      assert.deepEqual(r.body.roles, ["USER"]);
      assert.deepEqual(r.body.wallets, []);
      assert.deepEqual(r.body.requests, []);
    });
    await f.wallet(a);
    await t.test("wallet read is owner scoped", async () => {
      assert.equal(
        (await f.call(a, "GET", "/api/me")).body.wallets[0].address,
        a.key.publicKey(),
      );
      assert.deepEqual((await f.call(b, "GET", "/api/me")).body.wallets, []);
    });
    await f.call(admin, "POST", "/api/batteries", {
      batteryId: id,
      metadata: {
        type: "AA",
        manufacturer: "Demo",
        batch: "L1",
        privateNote: "not public",
        nested: { secret: "not public" },
      },
    });
    await t.test("battery exposes whitelisted metadata only", async () =>
      assert.deepEqual(
        (await f.call(a, "GET", "/api/batteries/" + id)).body.metadata,
        { type: "AA", manufacturer: "Demo", batch: "L1" },
      ),
    );
    const returned = await f.call(
      a,
      "POST",
      "/api/batteries/" + id + "/returns",
      {},
    );
    await t.test("requests are scoped to authenticated owner", async () => {
      const ar = await f.call(a, "GET", "/api/me"),
        br = await f.call(b, "GET", "/api/me");
      assert.equal(ar.body.requests[0].requestId, returned.body.requestId);
      assert.deepEqual(br.body.requests, []);
      assert.equal(ar.body.source, "MOCK");
    });
    await t.test(
      "battery never reveals another users request or recipient",
      async () => {
        const ar = await f.call(a, "GET", "/api/batteries/" + id),
          br = await f.call(b, "GET", "/api/batteries/" + id);
        assert.equal(ar.body.ownRequest.requestId, returned.body.requestId);
        assert.equal(br.body.ownRequest, null);
        assert.ok(!JSON.stringify(br.body).includes(a.key.publicKey()));
      },
    );
    await t.test("new read route cannot change roles", async () =>
      assert.equal(
        (await f.call(a, "POST", "/api/me", { role: "ADMIN" })).status,
        404,
      ),
    );
  } finally {
    await f.cleanup();
  }
});
