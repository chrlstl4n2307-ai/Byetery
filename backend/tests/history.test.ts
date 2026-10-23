import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  Account,
  Contract,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  xdr,
} from "@stellar/stellar-sdk";
import {
  chronological,
  HISTORY_DEPLOYMENT_ID,
  type HistoryRow,
} from "../src/history/model.ts";
import {
  RpcHistoryReader,
  verifyHistory,
  verifyHistoryRow,
  type HistoryReceipt,
  type HistoryChainReader,
} from "../src/history/verify.ts";
import { batteryHistory } from "../src/history/read.ts";
import { localDb } from "./testnet-fixtures.ts";
import { NETWORK_ID } from "../src/testnet/identity.ts";
import { ACTORS, CONTRACT, TOKEN, WASM } from "../src/testnet/abi.ts";
import { Repository } from "../src/application/repository.ts";
import { Coordinator } from "../src/application/coordinator.ts";
import { SupabaseAuth, type Identity } from "../src/application/auth.ts";
import { AppError } from "../src/application/errors.ts";
import { api, listen, close } from "../src/application/http.ts";

const battery = "BYE-D2-003-FIXTURE";
function fixture(
  method = "register_battery",
  id = battery,
  contract = CONTRACT,
  network = Networks.TESTNET,
) {
  // Unsigned public-only envelope; no operational key, signer or send exists here.
  const tx = new TransactionBuilder(new Account(ACTORS.service, "1"), {
    fee: "1000",
    networkPassphrase: network,
  })
    .addOperation(
      new Contract(contract).call(
        method,
        nativeToScVal(id, { type: "string" }),
      ),
    )
    .setTimebounds(1, 2)
    .build();
  const hash = Buffer.from(tx.hash()).toString("hex");
  const receipt: HistoryReceipt = {
    status: "SUCCESS",
    txHash: hash,
    ledger: 12,
    createdAt: "1792430537",
    envelopeXdr: tx.toXDR(),
    resultXdr: new xdr.TransactionResult({
      feeCharged: 1000n,
      result: xdr.TransactionResultResult.txSuccess([]),
      ext: xdr.TransactionResultExt.v0(),
    }).toXDR("base64"),
  };
  const row: HistoryRow = {
    id: randomUUID(),
    kind: method === "pay_reward" ? "REWARD" : "REGISTERED",
    state: "CONFIRMED",
    created_at: "2026-10-19T17:21:41.637Z",
    transaction_hash: hash,
    identity_network: NETWORK_ID,
    identity_contract: CONTRACT,
    confirmation_ledger: "12",
  };
  const chain: HistoryChainReader = {
    network: async () => ({ passphrase: Networks.TESTNET }),
    transaction: async (h) => {
      assert.equal(h, hash);
      return receipt;
    },
  };
  return { row, receipt, chain };
}
test("history confirms only persisted confirmation plus independently matched success/hash/invocation", async () => {
  const f = fixture(),
    e = await verifyHistoryRow(f.row, battery, CONTRACT, f.chain, true);
  assert.equal(e.verification, "CONFIRMED");
  assert.equal(e.chainResult, "SUCCESS");
  assert.equal(e.transactionHash, f.row.transaction_hash);
  assert.equal(e.confirmedAt, "2026-10-19T17:22:17.000Z");
  assert.equal(e.ledger, 12);
  const body = JSON.stringify(e);
  for (const key of [
    "envelopeXdr",
    "resultXdr",
    "parameters",
    "recipient",
    "command",
  ])
    assert.ok(!body.includes(key));
});
for (const [name, change, reason] of [
  [
    "not found",
    (f: ReturnType<typeof fixture>) => {
      f.receipt.status = "NOT_FOUND";
    },
    "NOT_FOUND_OR_OUTSIDE_RETENTION",
  ],
  [
    "wrong response hash",
    (f: ReturnType<typeof fixture>) => {
      f.receipt.txHash = "ff".repeat(32);
    },
    "INCOMPLETE_RECEIPT",
  ],
  [
    "wrong ledger",
    (f: ReturnType<typeof fixture>) => {
      f.receipt.ledger = 13;
    },
    "CONFIRMATION_LEDGER_MISMATCH",
  ],
  [
    "missing receipt",
    (f: ReturnType<typeof fixture>) => {
      delete f.receipt.envelopeXdr;
    },
    "INCOMPLETE_RECEIPT",
  ],
  [
    "pending SQL",
    (f: ReturnType<typeof fixture>) => {
      f.row.state = "UNKNOWN";
    },
    "SQL_NOT_CONFIRMED",
  ],
  [
    "wrong persisted identity",
    (f: ReturnType<typeof fixture>) => {
      f.row.identity_contract = TOKEN;
    },
    "PERSISTED_IDENTITY_MISMATCH",
  ],
  [
    "result mismatch",
    (f: ReturnType<typeof fixture>) => {
      f.receipt.status = "FAILED";
    },
    "RESULT_MISMATCH",
  ],
] as const)
  test(`history ${name} remains UNVERIFIED`, async () => {
    const f = fixture();
    change(f);
    const e = await verifyHistoryRow(f.row, battery, CONTRACT, f.chain, true);
    assert.equal(e.verification, "UNVERIFIED");
    assert.equal(e.reason, reason);
  });
test("wrong contract, battery and lifecycle method never confirm", async () => {
  for (const f of [
    fixture("register_battery", battery, TOKEN),
    fixture("register_battery", "BYE-OTHER"),
    fixture("open_return"),
  ]) {
    const e = await verifyHistoryRow(f.row, battery, CONTRACT, f.chain, true);
    assert.equal(e.reason, "INVOCATION_MISMATCH");
  }
});
test("Testnet hash is recalculated, not trusted from provider metadata", async () => {
  const f = fixture();
  f.receipt.envelopeXdr = fixture(
    "register_battery",
    battery,
    CONTRACT,
    Networks.PUBLIC,
  ).receipt.envelopeXdr;
  // Identical transaction bodies hash differently across networks. A provider cannot substitute a mainnet hash.
  f.row.transaction_hash = "aa".repeat(32);
  f.receipt.txHash = f.row.transaction_hash;
  f.chain.transaction = async () => f.receipt;
  assert.equal(
    (await verifyHistoryRow(f.row, battery, CONTRACT, f.chain, true)).reason,
    "TRANSACTION_HASH_MISMATCH",
  );
});
test("network mismatch and RPC outage never infer success or leak diagnostics", async () => {
  const f = fixture();
  f.chain.network = async () => ({ passphrase: Networks.PUBLIC });
  assert.equal(
    (await verifyHistory([f.row], battery, CONTRACT, f.chain))[0].reason,
    "NETWORK_UNVERIFIED",
  );
  f.chain.transaction = async () => {
    throw Error("secret-provider-diagnostic");
  };
  const e = await verifyHistoryRow(f.row, battery, CONTRACT, f.chain, true);
  assert.equal(e.reason, "CHAIN_READ_UNAVAILABLE");
  assert.ok(!JSON.stringify(e).includes("secret-provider"));
});
test("known failed transaction remains distinct from confirmed success", async () => {
  const f = fixture();
  f.receipt.status = "FAILED";
  f.receipt.resultXdr = new xdr.TransactionResult({
    feeCharged: 1000n,
    result: xdr.TransactionResultResult.txFailed([]),
    ext: xdr.TransactionResultExt.v0(),
  }).toXDR("base64");
  const e = await verifyHistoryRow(f.row, battery, CONTRACT, f.chain, true);
  assert.equal(e.verification, "UNVERIFIED");
  assert.equal(e.chainResult, "FAILED");
  assert.equal(e.reason, "CHAIN_FAILED");
});
test("history retains missing hashes and empty histories without invented stages", async () => {
  const f = fixture();
  f.row.transaction_hash = null;
  let reads = 0;
  f.chain.network = async () => {
    reads++;
    return { passphrase: Networks.TESTNET };
  };
  assert.deepEqual(await verifyHistory([], battery, CONTRACT, f.chain), []);
  assert.equal(
    (await verifyHistory([f.row], battery, CONTRACT, f.chain))[0].reason,
    "MISSING_TRANSACTION_HASH",
  );
  assert.equal(reads, 0);
});
test("chronology uses ledger timestamp with stable tie break; reward is a separate category", async () => {
  const f = fixture(),
    r = fixture("pay_reward");
  r.receipt.createdAt = "1792430637";
  const e = await verifyHistoryRow(f.row, battery, CONTRACT, f.chain, true),
    reward = await verifyHistoryRow(r.row, battery, CONTRACT, r.chain, true);
  e.recordedAt = "2026-10-20T00:00:00Z";
  reward.recordedAt = "2026-10-18T00:00:00Z";
  assert.deepEqual(
    chronological([reward, e]).map((x) => x.kind),
    ["REGISTERED", "REWARD"],
  );
  assert.equal(reward.category, "REWARD");
  assert.equal(e.category, "LIFECYCLE");
});
test("verification budget keeps unverified entries without further provider calls", async () => {
  const f = fixture();
  f.chain.network = async () => {
    throw Error("must not be called");
  };
  const result = await verifyHistory([f.row], battery, CONTRACT, f.chain, 0);
  assert.equal(result[0].reason, "VERIFICATION_BUDGET_EXHAUSTED");
  assert.equal(result[0].verification, "UNVERIFIED");
});
test("read transport is bounded to fixed Testnet and read-only RPC methods", async () => {
  const seen: string[] = [];
  const reader = new RpcHistoryReader(async (url, init) => {
    assert.equal(url, "https://soroban-testnet.stellar.org");
    assert.equal(init?.redirect, "error");
    const request = JSON.parse(String(init?.body));
    seen.push(request.method);
    assert.ok(["getNetwork", "getTransaction"].includes(request.method));
    return Response.json({
      jsonrpc: "2.0",
      id: 1,
      result:
        request.method === "getNetwork"
          ? { passphrase: Networks.TESTNET }
          : { status: "NOT_FOUND" },
    });
  });
  await reader.network();
  await reader.transaction("01".repeat(32));
  assert.deepEqual(seen, ["getNetwork", "getTransaction"]);
  assert.equal("send" in reader, false);
  assert.equal("simulate" in reader, false);
});

test("authenticated HTTP history uses read-only SQL; unknown/MOCK and revoked users fail closed", async (t) => {
  const db = await localDb(),
    user = randomUUID(),
    session = randomUUID(),
    missing = randomUUID(),
    mock = randomUUID();
  let sqlWrites = 0,
    reads = 0;
  try {
    await db.exec(
      "create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz)",
    );
    await db.query("insert into auth.users values($1),($2)", [user, missing]);
    await db.query(
      "insert into app_private.users(id,auth_user_id) values($1,$1)",
      [user],
    );
    await db.query("insert into auth.sessions values($1,$2,null)", [
      session,
      user,
    ]);
    for (const [d, mode] of [
      [HISTORY_DEPLOYMENT_ID, "TESTNET"],
      [mock, "MOCK"],
    ])
      await db.query(
        `insert into chain_private.deployments(id,mode,network_id,contract_address,wasm_hash,schema_version,admin,service,reward_token,reward_amount)
      values($1,$2,decode($3,'hex'),$4,decode($5,'hex'),1,$6,$7,$8,100000000)`,
        [
          d,
          mode,
          NETWORK_ID,
          CONTRACT,
          WASM,
          ACTORS.admin,
          ACTORS.service,
          TOKEN,
        ],
      );
    await db.query(
      "insert into api_private.memberships(deployment_id,user_id,role) values($1,$2,'USER')",
      [HISTORY_DEPLOYMENT_ID, user],
    );
    await db.query(
      "insert into app_private.battery_records(deployment_id,battery_id) values($1,$3),($2,$4)",
      [HISTORY_DEPLOYMENT_ID, mock, battery, "BYE-MOCK-ONLY"],
    );
    await db.query(
      `insert into app_private.stellar_operations(deployment_id,principal,idempotency_key,command,battery_id,parameters,parameters_hash,state)
      values($1,'fixture','history-fixture','register_battery',$2,'{"private_payload":"not for browser"}',decode($3,'hex'),'CONFIRMED')`,
      [HISTORY_DEPLOYMENT_ID, battery, "01".repeat(32)],
    );
    const pool = Object.assign(new EventEmitter(), {
      connect: async () =>
        Object.assign(new EventEmitter(), {
          query: async (sql: string, params?: unknown[]) => {
            if (
              /^\s*(insert|update|delete|truncate|create|alter|drop)\b/i.test(
                sql,
              )
            )
              sqlWrites++;
            return db.query(sql, params);
          },
          release: () => {},
        }),
    }) as unknown as Pool;
    const repo = Object.assign(
      Object.create(Repository.prototype) as Repository,
      { pool, deploymentId: HISTORY_DEPLOYMENT_ID, mode: "TESTNET" as const },
    );
    const chain: HistoryChainReader = {
      network: async () => {
        reads++;
        throw Error("no hash must mean no chain call");
      },
      transaction: async () => {
        reads++;
        throw Error("no transaction");
      },
    };
    class Auth extends SupabaseAuth {
      override async validate(header: string | undefined): Promise<Identity> {
        if (header !== "Bearer isolated-history-test")
          throw new AppError(401, "AuthenticationRequired");
        return { authUserId: user, sessionId: session };
      }
    }
    const coordinator = new Coordinator(repo);
    coordinator.mutate = async () => {
      throw Error("history may not mutate");
    };
    const server = api(new Auth({} as never), coordinator, chain),
      url = await listen(server);
    const identity = { authUserId: user, sessionId: session };
    try {
      const call = (path: string, method = "GET", auth = true) =>
        fetch(url + path, {
          method,
          headers: auth
            ? { Authorization: "Bearer isolated-history-test" }
            : {},
        });
      await t.test("unauthenticated GET is rejected", async () =>
        assert.equal(
          (await call("/api/batteries/" + battery + "/history", "GET", false))
            .status,
          401,
        ),
      );
      await t.test(
        "valid member gets persisted entry, still UNVERIFIED without hash",
        async () => {
          const response = await call(
            "/api/batteries/" + battery + "/history?deployment_id=" + mock,
          );
          assert.equal(response.status, 200);
          const body = await response.json();
          assert.equal(body.deploymentId, HISTORY_DEPLOYMENT_ID);
          assert.equal(body.entries[0].verification, "UNVERIFIED");
          assert.equal(body.entries[0].kind, "REGISTERED");
          assert.equal(body.source, "TESTNET");
          assert.ok(!JSON.stringify(body).includes("private_payload"));
        },
      );
      await t.test(
        "unknown battery and MOCK-only battery both return 404",
        async () => {
          for (const b of ["BYE-NOT-FOUND", "BYE-MOCK-ONLY"])
            assert.equal(
              (await call("/api/batteries/" + b + "/history")).status,
              404,
            );
        },
      );
      await t.test("empty history contains no invented stages", async () => {
        await db.query(
          "insert into app_private.battery_records(deployment_id,battery_id) values($1,$2)",
          [HISTORY_DEPLOYMENT_ID, "BYE-EMPTY"],
        );
        assert.deepEqual(
          (await (await call("/api/batteries/BYE-EMPTY/history")).json())
            .entries,
          [],
        );
      });
      await t.test("POST history is unavailable", async () =>
        assert.equal(
          (await call("/api/batteries/" + battery + "/history", "POST")).status,
          404,
        ),
      );
      await t.test(
        "wrong deployment or mode cannot query history",
        async () => {
          for (const r of [
            { ...repo, deploymentId: mock },
            { ...repo, mode: "MOCK" as const },
          ])
            await assert.rejects(
              batteryHistory(r, identity, battery, chain),
              /TestnetHistoryRequired/,
            );
        },
      );
      await t.test(
        "missing application user cannot be provisioned by read",
        async () => {
          await db.query("insert into auth.sessions values($1,$2,null)", [
            missing,
            missing,
          ]);
          await assert.rejects(
            batteryHistory(
              repo,
              { authUserId: missing, sessionId: missing },
              battery,
              chain,
            ),
            /HistoryReadForbidden/,
          );
        },
      );
      await t.test("disabled membership rejected", async () => {
        await db.query(
          "update api_private.memberships set enabled=false where user_id=$1",
          [user],
        );
        await assert.rejects(
          batteryHistory(repo, identity, battery, chain),
          /HistoryReadForbidden/,
        );
        await db.query(
          "update api_private.memberships set enabled=true where user_id=$1",
          [user],
        );
      });
      await t.test("revoked session rejected", async () => {
        await db.query("delete from auth.sessions where id=$1", [session]);
        await assert.rejects(
          batteryHistory(repo, identity, battery, chain),
          /SessionRevoked/,
        );
      });
      assert.equal(
        sqlWrites,
        0,
        "actual history SQL must not provision, mutate or reconcile",
      );
      assert.equal(reads, 0);
    } finally {
      await close(server);
    }
  } finally {
    await db.close();
  }
});
