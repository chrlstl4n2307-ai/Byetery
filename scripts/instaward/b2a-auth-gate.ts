/** B2A: bounded Auth-only experiment. No application mutation, SQL or signing. */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, realpathSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import assert from "node:assert/strict";
import type { SupabaseClient } from "../../frontend/node_modules/@supabase/supabase-js/dist/index.mjs";
import type { AuthoritativeAuth } from "../../frontend/src/server/direct-review/auth.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const START = "10a62d77158f1b200d2459b1a9dbb122576c350c";
const REF = "aemxuqnnwfclzrwwiqfd";
const ORIGIN = `https://${REF}.supabase.co`;
const REPORT = resolve(
  ROOT,
  "docs/instaward/d2/D2-008B2A-AUTH-SESSION-GATE.md",
);
const RESULTS = resolve(
  ROOT,
  "docs/instaward/d2/D2-008B2A-AUTH-SESSION-GATE-RESULTS.json",
);
const AUTH = pathToFileURL(
  resolve(ROOT, "frontend/src/server/direct-review/auth.ts"),
).href;
const ERRORS = pathToFileURL(
  resolve(ROOT, "frontend/src/server/direct-review/errors.ts"),
).href;
const AUTH_SHA =
  "d01801e61a03eb07e2188b7ffab2c6c2488570bd34b4c7686e5d7f896d5f5f32";
const ERRORS_SHA =
  "e6e42ac2f5a83226a870d97618dad4d68db192c78ba44df1e5340525802b6129";
const sha = (bytes: string | Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const HARNESS_SHA = sha(readFileSync(fileURLToPath(import.meta.url)));
const now = () => new Date().toISOString();
const safeCodes = new Set([
  "session_not_found",
  "session_expired",
  "refresh_token_not_found",
  "refresh_token_already_used",
  "refresh_token_expired",
  "invalid_credentials",
  "bad_jwt",
  "user_not_found",
  "over_request_rate_limit",
  "over_email_send_rate_limit",
  "request_timeout",
  "unexpected_failure",
]);
const code = (value: unknown): string | null =>
  typeof value === "string" && safeCodes.has(value) ? value : null;
// SDK diagnostics must not print request bodies, headers or session objects.
console.log =
  console.info =
  console.warn =
  console.error =
  console.debug =
    () => {};
const emit = (message: string) => process.stdout.write(message + "\n");

type HttpFact = {
  method: string;
  pathname: string;
  status: number;
  timestamp: string;
  authErrorCode: string | null;
};
type Validation = {
  classification: "ACCEPTED" | "REJECTED" | "UNAVAILABLE";
  httpStatus: number | null;
  authErrorCode: string | null;
  timestamp: string;
};
type DryRun = {
  status: string;
  cases: { case: string; variants: number; status: string }[];
  actualB2Module: string;
  realAdapterExercised: boolean;
  sourceHashVerified: boolean;
  networkCalls: number;
  secretOutputDetected: boolean;
  filesystemSecretWrites: number;
  negativeRoleGuard: boolean;
  blockedSensitiveSinkProbes: number;
};
type Result = {
  task: string;
  timestamp: string;
  projectRef: string;
  accountClass: string;
  supabaseJsVersion: string;
  startingGitSha: string;
  harnessSha256: string;
  dryRun: DryRun;
  execution: string;
  sessionAInitial: Validation | null;
  sessionBInitial: Validation | null;
  negativeControl: Validation | null;
  negativeControlLogoutRequests: number;
  localLogoutHttpStatus: number | null;
  localLogoutSdkErrorPresent: boolean | null;
  sessionAAfterLocalLogout: Validation | null;
  sessionBAfterLocalLogout: Validation | null;
  refreshAAfterLocalLogout: string;
  refreshAuthErrorCode: string | null;
  globalCleanup: {
    status: string;
    logoutHttpStatus: number | null;
    sessionBAfter: Validation | null;
  };
  minutesUntilExpA: number | null;
  minutesUntilExpB: number | null;
  finalCase: string;
  strategyDecision: string;
  stopReason: string | null;
  clientIsolation: {
    separateClients: boolean;
    separateMemoryStorage: boolean;
    separateStorageKeys: boolean;
    independentLogins: number;
    distinctSessionIds: boolean | null;
    validatorSessionAbsent: boolean;
  };
  realB2Invocations: number;
  http: HttpFact[];
  expiryTest: string;
  remoteSideEffectsClassification: string;
  secretExposure: boolean;
};
type Retained = {
  access: string;
  refresh: string;
  exp: number;
  sid: string | null;
};
type Credentials = { email: string; password: string; expectedUserId: string };
type SDK =
  typeof import("../../frontend/node_modules/@supabase/supabase-js/dist/index.mjs");
type B2 = typeof import("../../frontend/src/server/direct-review/auth.ts");
type ReviewErrors =
  typeof import("../../frontend/src/server/direct-review/errors.ts");
type Transport = (url: URL, init: RequestInit) => Promise<Response>;
class Halt extends Error {
  constructor(
    readonly reason: string,
    readonly caseNumber = 4,
  ) {
    super("Bounded experiment stop");
  }
}

async function dependencies() {
  assert.equal(sha(readFileSync(new URL(AUTH))), AUTH_SHA);
  assert.equal(sha(readFileSync(new URL(ERRORS))), ERRORS_SHA);
  let noopResolutions = 0;
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (
        specifier === "server-only" &&
        [AUTH, ERRORS].includes(context.parentURL ?? "")
      ) {
        noopResolutions++;
        return { url: "data:text/javascript,export{}", shortCircuit: true };
      }
      // Extension resolution only: the original errors.ts content is not mocked.
      if (context.parentURL === AUTH && specifier === "./errors")
        return next(ERRORS, context);
      return next(specifier, context);
    },
  });
  let b2: B2, errors: ReviewErrors;
  try {
    b2 = await import(AUTH);
    errors = await import(ERRORS);
  } finally {
    hooks.deregister();
  }
  assert.equal(noopResolutions, 2);
  const requireFrontend = createRequire(resolve(ROOT, "frontend/package.json"));
  const entry = realpathSync.native(
    requireFrontend.resolve("@supabase/supabase-js"),
  );
  assert(
    !relative(resolve(ROOT, "frontend/node_modules"), entry).startsWith(".."),
  );
  assert.equal(
    requireFrontend("@supabase/supabase-js/package.json").version,
    "2.116.0",
  );
  const sdk = requireFrontend("@supabase/supabase-js") as SDK;
  return { b2, errors, sdk };
}
type Dependencies = Awaited<ReturnType<typeof dependencies>>;

function newResult(dryRun: DryRun, live: boolean): Result {
  return {
    task: "D2-008B2A",
    timestamp: now(),
    projectRef: REF,
    accountClass: "EXISTING_REVIEW_USER",
    supabaseJsVersion: "2.116.0",
    startingGitSha: START,
    harnessSha256: HARNESS_SHA,
    dryRun,
    execution: live ? "LIVE" : "OFFLINE",
    sessionAInitial: null,
    sessionBInitial: null,
    negativeControl: null,
    negativeControlLogoutRequests: 0,
    localLogoutHttpStatus: null,
    localLogoutSdkErrorPresent: null,
    sessionAAfterLocalLogout: null,
    sessionBAfterLocalLogout: null,
    refreshAAfterLocalLogout: "NOT_RUN",
    refreshAuthErrorCode: null,
    globalCleanup: {
      status: "NOT_RUN",
      logoutHttpStatus: null,
      sessionBAfter: null,
    },
    minutesUntilExpA: null,
    minutesUntilExpB: null,
    finalCase: "NOT_RUN",
    strategyDecision: "NOT_DETERMINED",
    stopReason: null,
    clientIsolation: {
      separateClients: true,
      separateMemoryStorage: true,
      separateStorageKeys: true,
      independentLogins: 0,
      distinctSessionIds: null,
      validatorSessionAbsent: true,
    },
    realB2Invocations: 0,
    http: [],
    expiryTest: "NOT_RUN",
    remoteSideEffectsClassification: live
      ? "NORMAL_AUTH_ONLY"
      : "NONE — OFFLINE",
    secretExposure: false,
  };
}

function instrument(transport: Transport, facts: HttpFact[]): typeof fetch {
  let calls = 0,
    blocked = false;
  return async (input, init = {}) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    const method = (init.method ?? "GET").toUpperCase();
    const allowed =
      url.origin === ORIGIN &&
      !url.username &&
      !url.password &&
      !url.hash &&
      ((method === "GET" && url.pathname === "/auth/v1/user" && !url.search) ||
        (method === "POST" &&
          url.pathname === "/auth/v1/token" &&
          [...url.searchParams.keys()].join() === "grant_type" &&
          ["password", "refresh_token"].includes(
            url.searchParams.get("grant_type") ?? "",
          )) ||
        (method === "POST" &&
          url.pathname === "/auth/v1/logout" &&
          [...url.searchParams.keys()].join() === "scope" &&
          ["local", "global"].includes(url.searchParams.get("scope") ?? "")));
    if (!allowed || blocked || ++calls > 16)
      throw new Halt("AUTH_REQUEST_BOUNDARY");
    try {
      const response = await transport(url, {
        ...init,
        method,
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      });
      let officialCode: string | null = null;
      if (!response.ok) {
        try {
          officialCode = code((await response.clone().json()).code);
        } catch {
          /* no body is retained */
        }
      }
      facts.push({
        method,
        pathname: url.pathname,
        status: response.status,
        timestamp: now(),
        authErrorCode: officialCode,
      });
      // A transport/outage ambiguity must not become SDK retry traffic.
      if (response.status >= 500 || response.status === 429) blocked = true;
      return response;
    } catch {
      blocked = true;
      throw new Halt("AUTH_TRANSPORT_UNAVAILABLE");
    }
  };
}

function retain(
  session: { access_token: string; refresh_token: string },
  sensitive: string[],
): Retained {
  const payload = JSON.parse(
    Buffer.from(session.access_token.split(".")[1], "base64url").toString(
      "utf8",
    ),
  );
  if (!Number.isSafeInteger(payload.exp)) throw new Halt("INVALID_EXPIRY");
  const sid =
    typeof payload.session_id === "string" ? payload.session_id : null;
  sensitive.push(session.access_token, session.refresh_token);
  if (sid) sensitive.push(sid);
  return {
    access: session.access_token,
    refresh: session.refresh_token,
    exp: payload.exp,
    sid,
  };
}

/** Only safe result structures reach a sink. Never serialize SDK/user/session objects. */
function sanitized(result: Result, sensitive: string[]): string {
  const text = JSON.stringify(result, null, 2);
  for (const secret of sensitive)
    if (secret && text.includes(secret)) throw new Halt("SECRET_OUTPUT_GUARD");
  assert(
    !/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{8,}/.test(text),
  );
  assert(!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text));
  assert(!/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/i.test(text));
  assert(
    !/"(?:password|access_token|refresh_token|email|auth_uid|session_id|cookie|authorization|apikey)"\s*:/i.test(
      text,
    ),
  );
  assert(
    result.http.every(
      (f) =>
        Object.keys(f).sort().join() ===
          "authErrorCode,method,pathname,status,timestamp" &&
        !f.pathname.includes("?"),
    ),
  );
  return text + "\n";
}

async function experiment(
  deps: Dependencies,
  credentials: Credentials,
  key: string,
  transport: Transport,
  result: Result,
  sensitive: string[],
  sink: (result: Result, sensitive: string[]) => void,
  globalCleanup: boolean,
) {
  const records = result.http,
    fetcher = instrument(transport, records),
    storageKeys = new Set<string>();
  const client = () => {
    const memory = new Map<string, string>(),
      storageKey = "byetery-b2a-" + randomUUID();
    storageKeys.add(storageKey);
    const instance = deps.sdk.createClient(ORIGIN, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey,
        storage: {
          getItem: (k) => memory.get(k) ?? null,
          setItem: (k, v) => {
            memory.set(k, v);
          },
          removeItem: (k) => {
            memory.delete(k);
          },
        },
      },
      global: { fetch: fetcher },
    });
    return { instance, memory };
  };
  let A: ReturnType<typeof client> | null = client();
  const B = client(),
    V = client();
  let a: Retained | null = null,
    b: Retained | null = null;
  const authority: AuthoritativeAuth = {
    getUser: async (token) => {
      const response = await V.instance.auth.getUser(token);
      if (response.error) {
        const invalid = [400, 401, 403].includes(response.error.status ?? 0);
        throw new deps.errors.ReviewError(
          invalid ? 401 : 503,
          invalid ? "Unauthenticated" : "AuthUnavailable",
        );
      }
      if (
        !response.data.user ||
        response.data.user.id !== credentials.expectedUserId
      )
        throw new deps.errors.ReviewError(503, "AuthUnavailable");
      return { id: response.data.user.id, role: response.data.user.role ?? "" };
    },
  };
  const validate = async (token: string): Promise<Validation> => {
    const at = records.length;
    result.realB2Invocations++;
    let classification: Validation["classification"];
    try {
      await deps.b2.authenticate(token, authority, "AUTH_USER_ONLY");
      classification = "ACCEPTED";
    } catch (error) {
      classification =
        error instanceof deps.errors.ReviewError && error.status === 401
          ? "REJECTED"
          : "UNAVAILABLE";
    }
    const fact = records
      .slice(at)
      .findLast((f) => f.pathname === "/auth/v1/user");
    return {
      classification,
      httpStatus: fact?.status ?? null,
      authErrorCode: fact?.authErrorCode ?? null,
      timestamp: now(),
    };
  };
  const requireAccepted = (v: Validation) => {
    if (v.classification !== "ACCEPTED")
      throw new Halt("INITIAL_OR_CONTROL_VALIDATION_FAILED");
  };
  const timeGate = (which: "A" | "B", token: Retained) => {
    const minutes = Math.min(
      1440,
      Math.max(0, Math.floor((token.exp - Date.now() / 1000) / 60)),
    );
    if (which === "A") result.minutesUntilExpA = minutes;
    else result.minutesUntilExpB = minutes;
    if (minutes < 10) throw new Halt("INSUFFICIENT_NATURAL_VALIDITY");
  };
  const login = async (instance: SupabaseClient) => {
    const response = await instance.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    });
    if (
      response.error ||
      !response.data.session ||
      response.data.user?.id !== credentials.expectedUserId
    )
      throw new Halt("LOGIN_REJECTED_OR_UNAVAILABLE");
    result.clientIsolation.independentLogins++;
    return retain(response.data.session, sensitive);
  };
  try {
    assert.equal((await V.instance.auth.getSession()).data.session, null);
    a = await login(A.instance);
    timeGate("A", a);
    result.sessionAInitial = await validate(a.access);
    requireAccepted(result.sessionAInitial);
    b = await login(B.instance);
    timeGate("B", b);
    result.sessionBInitial = await validate(b.access);
    requireAccepted(result.sessionBInitial);
    if (a.sid && b.sid) {
      result.clientIsolation.distinctSessionIds = a.sid !== b.sid;
      if (a.sid === b.sid) throw new Halt("SESSIONS_NOT_INDEPENDENT");
    }
    const beforeDisposal = records.filter(
      (f) => f.pathname === "/auth/v1/logout",
    ).length;
    await A.instance.auth.stopAutoRefresh();
    A.memory.clear();
    A = null;
    timeGate("A", a);
    result.negativeControl = await validate(a.access);
    requireAccepted(result.negativeControl);
    result.negativeControlLogoutRequests =
      records.filter((f) => f.pathname === "/auth/v1/logout").length -
      beforeDisposal;
    if (result.negativeControlLogoutRequests !== 0)
      throw new Halt("DISPOSAL_SENT_LOGOUT");
    A = client();
    const restored = await A.instance.auth.setSession({
      access_token: a.access,
      refresh_token: a.refresh,
    });
    if (restored.error || restored.data.user?.id !== credentials.expectedUserId)
      throw new Halt("RESTORE_FOR_LOGOUT_FAILED");
    timeGate("A", a);
    const logoutAt = records.length;
    const logout = await A.instance.auth.signOut({ scope: "local" });
    result.localLogoutSdkErrorPresent = !!logout.error;
    const logoutFacts = records
      .slice(logoutAt)
      .filter((f) => f.method === "POST" && f.pathname === "/auth/v1/logout");
    result.localLogoutHttpStatus =
      logoutFacts.length === 1 ? logoutFacts[0].status : null;
    if (result.localLogoutHttpStatus !== 204 || logout.error)
      throw new Halt("LOCAL_LOGOUT_NOT_CONFIRMED_204");
    timeGate("A", a);
    result.sessionAAfterLocalLogout = await validate(a.access);
    if (result.sessionAAfterLocalLogout.classification === "ACCEPTED")
      throw new Halt("REVOKED_A_ACCEPTED", 2);
    if (
      result.sessionAAfterLocalLogout.classification !== "REJECTED" ||
      ![400, 401, 403].includes(result.sessionAAfterLocalLogout.httpStatus ?? 0)
    )
      throw new Halt("A_VALIDATION_AMBIGUOUS");
    timeGate("B", b);
    result.sessionBAfterLocalLogout = await validate(b.access);
    if (result.sessionBAfterLocalLogout.classification === "REJECTED")
      throw new Halt("INDEPENDENT_B_REJECTED", 3);
    if (result.sessionBAfterLocalLogout.classification !== "ACCEPTED")
      throw new Halt("B_VALIDATION_AMBIGUOUS");
    const refreshed = await A.instance.auth.refreshSession({
      refresh_token: a.refresh,
    });
    result.refreshAuthErrorCode =
      code(refreshed.error?.code) ??
      records.findLast((f) => f.pathname === "/auth/v1/token")?.authErrorCode ??
      null;
    result.refreshAAfterLocalLogout =
      refreshed.error && !refreshed.data.session
        ? "REJECTED"
        : "UNEXPECTED_OR_UNAVAILABLE";
    if (
      result.refreshAAfterLocalLogout !== "REJECTED" ||
      ![400, 401, 403].includes(refreshed.error?.status ?? 0)
    )
      throw new Halt("REFRESH_NOT_CONFIRMED_REJECTED");
    assert.equal((await V.instance.auth.getSession()).data.session, null);
    assert.equal(storageKeys.size, 4);
    result.finalCase = "CASE 1";
    result.strategyDecision = "AUTH_USER_ONLY SUFFICIENT";
  } catch (error) {
    const halted =
      error instanceof Halt
        ? error
        : new Halt("AUTH_SERVICE_OR_PROTOCOL_AMBIGUOUS");
    result.finalCase = `CASE ${halted.caseNumber}`;
    result.strategyDecision =
      halted.caseNumber === 2
        ? "SESSION LIVENESS ORACLE REQUIRED"
        : "B2A INCONCLUSIVE";
    result.stopReason = halted.reason;
  } finally {
    if (A) {
      await A.instance.auth.stopAutoRefresh();
      A.memory.clear();
    }
    await V.instance.auth.stopAutoRefresh();
    V.memory.clear();
  }
  // A partial primary snapshot is distinguishable from a fully completed run.
  const completed =
    result.execution === "LIVE" ? "LIVE_COMPLETE" : "OFFLINE_COMPLETE";
  result.execution =
    result.finalCase === "CASE 1" ? "PRIMARY_RECORDED" : completed;
  // Primary evidence is saved before optional cleanup; cleanup never rewrites it.
  sink(result, sensitive);
  if (result.finalCase === "CASE 1" && globalCleanup && b) {
    try {
      const at = records.length,
        response = await B.instance.auth.signOut({ scope: "global" });
      const facts = records
        .slice(at)
        .filter((f) => f.method === "POST" && f.pathname === "/auth/v1/logout");
      result.globalCleanup.logoutHttpStatus =
        facts.length === 1 ? facts[0].status : null;
      if (!response.error && result.globalCleanup.logoutHttpStatus === 204)
        result.globalCleanup.sessionBAfter = await validate(b.access);
      result.globalCleanup.status =
        result.globalCleanup.sessionBAfter?.classification === "REJECTED"
          ? "PASS"
          : "FAIL";
    } catch {
      result.globalCleanup.status = "FAIL";
    }
    sink(result, sensitive);
  }
  await B.instance.auth.stopAutoRefresh();
  B.memory.clear();
  a = null;
  b = null;
  if (result.finalCase === "CASE 1") {
    result.execution = completed;
    sink(result, sensitive);
  }
  return result;
}

function writeEvidence(result: Result, sensitive: string[]) {
  const text = sanitized(result, sensitive);
  writeFileSync(RESULTS, text, { encoding: "utf8", mode: 0o600 });
  const view = (v: Validation | null) =>
    v
      ? `${v.classification}; HTTP ${v.httpStatus ?? "unavailable"}; code ${v.authErrorCode ?? "not available"}`
      : "NOT_RUN";
  const md = `# D2-008B2A — Supabase Auth Session Gate\n\n## Scope\n\nSupabase Auth semantics gate only; NOT D2.6 acceptance. ${result.execution}. No SQL, project configuration, Vercel or Stellar work.\n\n## Starting checkpoint\n\nBranch: instaward/d2-web-mvp. Starting SHA: \`${START}\`. SDK: @supabase/supabase-js 2.116.0.\n\n## Harness design\n\nThree independent clients with persistSession=false, autoRefreshToken=false, separate memory/key namespaces; a fourth fresh A instance restores only retained in-memory material via official setSession. Validator V calls the original B2 authenticate() with AuthoritativeAuth backed by official getUser(exact retained token). Only server-only is replaced by an exact-parent no-op loader; errors.ts receives extension resolution without content replacement. Both original source hashes are pinned.\n\nHarness SHA-256: \`${HARNESS_SHA}\`. Real B2 calls: ${result.realB2Invocations}. SQL/Vercel/Stellar paths: none. Fixed project-only Auth fetch allowlist; no arbitrary URL, admin client, retry loop or credential fallback.\n\n## Secret handling\n\nPassword comes only from raw-mode no-echo interactive terminal, never CLI/env/file/chat. Existing USER1 account is selected from an existing local inventory, not created or reset; its identifiers are compared only in memory. Only existing public project URL/publishable key are used. Tokens, claims, refresh material and session IDs remain in memory. No token hashes. SDK console diagnostics disabled. The sole filesystem sink accepts sanitized results/markdown, not SDK objects. No private identifiers are published.\n\n## Dry-run cases\n\n${result.dryRun.status}; real B2 exercised: ${result.dryRun.realAdapterExercised}; external calls: ${result.dryRun.networkCalls}; cases: ${result.dryRun.cases.map((c) => `${c.case} ${c.status} (${c.variants} variant(s))`).join("; ")}. Secret stdout/stderr/result and sink checks PASS; frozen module/role guard checked. Mock JWT/session material is offline-only and never published.\n\n## Session A\n\n${view(result.sessionAInitial)}. Rounded minutes remaining: ${result.minutesUntilExpA ?? "NOT_RUN"}.\n\n## Session B\n\n${view(result.sessionBInitial)}. Rounded minutes remaining: ${result.minutesUntilExpB ?? "NOT_RUN"}. Independent logins: ${result.clientIsolation.independentLogins}; distinct session IDs (in-memory comparison only): ${result.clientIsolation.distinctSessionIds ?? "not available"}.\n\n## Negative control\n\n${view(result.negativeControl)}. Logout requests caused by local disposal: ${result.negativeControlLogoutRequests}.\n\n## Local logout HTTP proof\n\nPOST /auth/v1/logout HTTP ${result.localLogoutHttpStatus ?? "NOT_RUN"}; SDK error present: ${result.localLogoutSdkErrorPresent ?? "NOT_RUN"}. Query strings/headers/bodies are not recorded. SDK error=null alone never establishes revocation; exact observed 204 is mandatory.\n\n## B2 adapter validation\n\nA after logout: ${view(result.sessionAAfterLocalLogout)}. B after A logout: ${view(result.sessionBAfterLocalLogout)}. Natural expiry gate >=10 minutes is checked before primary retained-token validations. These results concern the exact B2 authoritative getUser path, not offline JWT signature validation or every downstream API.\n\n## Refresh result\n\n${result.refreshAAfterLocalLogout}; safe Auth code: ${result.refreshAuthErrorCode ?? "not available"}. Official refreshSession only. Natural expiry test: ${result.expiryTest}; no waiting, forged expired token or JWT setting change.\n\n## Global cleanup\n\n${result.globalCleanup.status}; HTTP ${result.globalCleanup.logoutHttpStatus ?? "NOT_RUN"}; B: ${view(result.globalCleanup.sessionBAfter)}. Optional cleanup runs only after primary CASE 1 evidence is safely saved, never overwrites that primary decision. Non-CASE-1 stops before cleanup.\n\n## Decision\n\n${result.finalCase} — **${result.strategyDecision}**. Stop reason: ${result.stopReason ?? "none"}. ${result.finalCase === "CASE 1" ? "AUTH_USER_ONLY VERIFIED FOR CURRENT SUPABASE BEHAVIOR; scoped to this project/runtime/library version, not an eternal protocol guarantee." : "No architecture change or public publication is authorized by this result. OWNER REVIEW REQUIRED for CASE 2/3/4; no liveness oracle implemented."}\n\n## Remote side effects\n\n${result.remoteSideEffectsClassification}. Only normal Auth sessions/refresh records/revocation/audit/last-sign-in/rate-limit effects are permitted. Actual observed requests/statuses are in the sanitized JSON; no SQL, grants, RLS, membership/review_access, Auth account/password/config change, Vercel, Stellar call/signature/broadcast or USER2. No application mutation was performed.\n\n## Files changed\n\nOnly scripts/instaward/b2a-auth-gate.ts and the two B2A report/results files. frontend, backend, contracts, database, B1/B2 SQL, signer and protected untracked files remain unchanged.\n\n## Project status\n\nD1 12/12 PASS; D2 5/6 PASS; D3 0/5; TOTAL 17/23. D2.6 pending. Internal owner acceptance only, not Stellar/SDF/Instawards approval or payment. STOP; no remote SQL apply.\n\nReferences: [official signOut](https://supabase.com/docs/reference/javascript/auth-signout), [getUser](https://supabase.com/docs/reference/javascript/auth-getuser), and the installed 2.116.0 Auth SDK source. Documentation warns against treating access-token cryptographic lifetime as session liveness; this experiment measures the current authoritative B2 path.\n`;
  for (const secret of sensitive)
    if (secret && md.includes(secret)) throw new Halt("SECRET_REPORT_GUARD");
  writeFileSync(REPORT, md, { encoding: "utf8", mode: 0o600 });
}

const emptyDryRun = (): DryRun => ({
  status: "NOT_RUN",
  cases: [],
  actualB2Module: "frontend/src/server/direct-review/auth.ts",
  realAdapterExercised: false,
  sourceHashVerified: false,
  networkCalls: 0,
  secretOutputDetected: false,
  filesystemSecretWrites: 0,
  negativeRoleGuard: false,
  blockedSensitiveSinkProbes: 0,
});

async function dryRun(deps: Dependencies): Promise<DryRun> {
  const report = emptyDryRun(),
    originalFetch = globalThis.fetch;
  let attemptedNetwork = 0;
  globalThis.fetch = async () => {
    attemptedNetwork++;
    throw new Error("OfflineOnly");
  };
  const output: string[] = [],
    originalOut = process.stdout.write,
    originalErr = process.stderr.write;
  process.stdout.write = ((value: string | Uint8Array) => {
    output.push(String(value));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((value: string | Uint8Array) => {
    output.push(String(value));
    return true;
  }) as typeof process.stderr.write;
  const uid = "11111111-1111-4111-8111-111111111111",
    email = "b2a-offline@example.invalid",
    password = "B2A_CANARY_PASSWORD_OFFLINE";
  const jwt = (sid: string, minutes = 60) =>
    [
      Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
        "base64url",
      ),
      Buffer.from(
        JSON.stringify({
          sub: uid,
          role: "authenticated",
          exp: Math.floor(Date.now() / 1000) + minutes * 60,
          session_id: sid,
        }),
      ).toString("base64url"),
      Buffer.from("OFFLINE_SIGNATURE_ONLY").toString("base64url"),
    ].join(".");
  try {
    for (const variant of [
      "CASE1",
      "CASE2",
      "CASE3",
      "CASE4_LOGOUT",
      "CASE4_UNAVAILABLE",
      "CASE4_EXPIRY",
    ]) {
      const secrets = [uid, email, password],
        a = jwt(
          "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          variant === "CASE4_EXPIRY" ? 9 : 60,
        ),
        b = jwt("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
      const ra = "OFFLINE_REFRESH_SESSION_A_ONLY",
        rb = "OFFLINE_REFRESH_SESSION_B_ONLY";
      secrets.push(a, b, ra, rb);
      let logins = 0,
        loggedOut = false,
        globallyOut = false;
      const user = { id: uid, role: "authenticated", aud: "authenticated" };
      const fake: Transport = async (url, init) => {
        if (
          url.pathname.endsWith("/token") &&
          url.searchParams.get("grant_type") === "password"
        ) {
          logins++;
          return Response.json({
            access_token: logins === 1 ? a : b,
            refresh_token: logins === 1 ? ra : rb,
            token_type: "bearer",
            expires_in: 3600,
            user,
          });
        }
        if (url.pathname.endsWith("/logout")) {
          if (variant === "CASE4_LOGOUT")
            return Response.json(
              { code: "bad_jwt", msg: "Offline rejection" },
              { status: 403 },
            );
          if (url.searchParams.get("scope") === "global") globallyOut = true;
          else loggedOut = true;
          return new Response(null, { status: 204 });
        }
        if (url.pathname.endsWith("/token"))
          return Response.json(
            { code: "refresh_token_not_found", msg: "Offline revoked" },
            { status: 400 },
          );
        const presented = new Headers(init.headers).get("Authorization");
        if (variant === "CASE4_UNAVAILABLE")
          return Response.json(
            { code: "unexpected_failure", msg: "Offline unavailable" },
            { status: 503 },
          );
        if (
          globallyOut ||
          (loggedOut &&
            variant !== "CASE2" &&
            (presented === "Bearer " + a || variant === "CASE3"))
        )
          return Response.json(
            { code: "session_not_found", msg: "Offline revoked" },
            { status: 401 },
          );
        return Response.json(user);
      };
      const writes: string[] = [],
        result = await experiment(
          deps,
          { email, password, expectedUserId: uid },
          "sb_publishable_B2A_OFFLINE_ONLY",
          fake,
          newResult(report, false),
          secrets,
          (value, sensitive) => {
            writes.push(sanitized(value, sensitive));
          },
          true,
        );
      const expected =
        variant === "CASE1"
          ? "CASE 1"
          : variant === "CASE2"
            ? "CASE 2"
            : variant === "CASE3"
              ? "CASE 3"
              : "CASE 4";
      assert.equal(result.finalCase, expected);
      if (expected === "CASE 1") {
        assert.equal(result.strategyDecision, "AUTH_USER_ONLY SUFFICIENT");
        assert.equal(result.globalCleanup.status, "PASS");
      }
      if (expected === "CASE 2") {
        assert.equal(
          result.strategyDecision,
          "SESSION LIVENESS ORACLE REQUIRED",
        );
        assert.equal(result.sessionBAfterLocalLogout, null);
      }
      if (variant === "CASE4_LOGOUT") {
        assert.equal(result.localLogoutHttpStatus, 403);
        assert.equal(result.localLogoutSdkErrorPresent, false);
        assert.equal(result.sessionAAfterLocalLogout, null);
      }
      assert(result.realB2Invocations > 0 || variant === "CASE4_EXPIRY");
      for (const probe of [password, a, ra, email, uid]) {
        assert.throws(() =>
          sanitized({ ...result, stopReason: probe }, secrets),
        );
        report.blockedSensitiveSinkProbes++;
      }
      for (const secret of secrets)
        assert(![...writes, ...output].some((value) => value.includes(secret)));
    }
    await assert.rejects(
      deps.b2.authenticate("offline-guard", {
        getUser: async () => ({ id: uid, role: "service_role" }),
      }),
      (error) =>
        error instanceof deps.errors.ReviewError && error.status === 401,
    );
    assert.equal(attemptedNetwork, 0);
    assert.equal(output.length, 0);
    report.status = "PASS";
    report.cases = [1, 2, 3, 4].map((n) => ({
      case: `CASE ${n}`,
      variants: n === 4 ? 3 : 1,
      status: "PASS",
    }));
    report.realAdapterExercised = true;
    report.sourceHashVerified = true;
    report.negativeRoleGuard = true;
    return report;
  } finally {
    globalThis.fetch = originalFetch;
    process.stdout.write = originalOut;
    process.stderr.write = originalErr;
  }
}

async function noEchoPrompt(label: string): Promise<string> {
  if (
    !process.stdin.isTTY ||
    !process.stdout.isTTY ||
    typeof process.stdin.setRawMode !== "function"
  )
    throw new Halt("OWNER_INPUT_METHOD_REQUIRED");
  process.stdout.write(label);
  const previous = process.stdin.isRaw;
  process.stdin.setRawMode(true);
  process.stdin.setEncoding("utf8");
  process.stdin.resume();
  return new Promise((done, reject) => {
    let value = "";
    const finish = (cancelled = false) => {
      process.stdin.off("data", data);
      process.stdin.setRawMode(previous);
      process.stdin.pause();
      process.stdout.write("\n");
      const answer = value;
      value = "";
      if (cancelled) reject(new Halt("OWNER_INPUT_CANCELLED"));
      else done(answer);
    };
    const data = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          finish();
          return;
        }
        if (ch === "\x03" || ch === "\x1b") {
          finish(true);
          return;
        }
        if (ch === "\x7f" || ch === "\b") {
          value = [...value].slice(0, -1).join("");
          continue;
        }
        if (ch.charCodeAt(0) < 32 || value.length >= 256) {
          finish(true);
          return;
        }
        value += ch;
      }
    };
    process.stdin.on("data", data);
  });
}

function liveConfiguration() {
  const publicLines = readFileSync(resolve(ROOT, "frontend/.env.local"), "utf8")
    .split(/\r?\n/)
    .filter((line) =>
      /^\s*(?:SUPABASE_URL|SUPABASE_PUBLISHABLE_KEY)\s*=/.test(line),
    )
    .join("\n");
  const env = parseEnv(publicLines),
    key = env.SUPABASE_PUBLISHABLE_KEY;
  if (env.SUPABASE_URL !== ORIGIN || !key || key.startsWith("sb_secret_"))
    throw new Halt("PUBLIC_PROJECT_CONFIGURATION_REQUIRED");
  let safe = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
  if (key.startsWith("eyJ")) {
    try {
      const claim = JSON.parse(
        Buffer.from(key.split(".")[1], "base64url").toString(),
      );
      safe =
        key.split(".").length === 3 &&
        claim.role === "anon" &&
        claim.ref === REF;
    } catch {
      safe = false;
    }
  }
  if (!safe) throw new Halt("NON_PUBLIC_KEY_REJECTED");
  const existing = JSON.parse(
    readFileSync(resolve(ROOT, ".tools/d2/demo-auth-before.json"), "utf8"),
  ).snapshot.accounts.find((u: { alias: string }) => u.alias === "USER1");
  if (
    !existing ||
    !existing.email ||
    !existing.authUserId ||
    existing.principal?.auth_user_id !== existing.authUserId ||
    existing.principal?.status !== "ACTIVE" ||
    !existing.memberships?.some(
      (m: { role: string; enabled: boolean }) => m.role === "USER" && m.enabled,
    )
  )
    throw new Halt("EXISTING_REVIEW_ACCOUNT_REQUIRED");
  if (!/byetery|instaward|demo|test/i.test(existing.email))
    throw new Halt("PERSONAL_ACCOUNT_REJECTED");
  return {
    key,
    email: existing.email as string,
    expectedUserId: existing.authUserId as string,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (
    args.length !== 1 ||
    !["--dry-run", "--live", "--prompt-test"].includes(args[0])
  )
    throw new Halt("UNSUPPORTED_ARGUMENTS");
  if (args[0] === "--prompt-test") {
    const answer = await noEchoPrompt("No-echo canary input: ");
    assert.equal(answer, "B2A_NO_ECHO_CANARY");
    emit("NO_ECHO_CHECK_PASS");
    return;
  }
  const deps = await dependencies(),
    dry = await dryRun(deps); // Failure stops BEFORE reading credentials or allowing network.
  if (args[0] === "--dry-run") {
    const result = newResult(dry, false);
    result.execution = "DRY_RUN_PASS — LIVE_NOT_RUN";
    writeEvidence(result, []);
    emit(
      JSON.stringify({
        status: "DRY_RUN_PASS",
        cases: dry.cases,
        realB2Module: dry.actualB2Module,
        harnessSha256: HARNESS_SHA,
      }),
    );
    return;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    emit("B2A LIVE RUN READY — OWNER INPUT METHOD REQUIRED");
    process.exitCode = 2;
    return;
  }
  if (
    ["NODE_DEBUG", "NODE_DEBUG_NATIVE", "NODE_OPTIONS", "SSLKEYLOGFILE"].some(
      (name) => Boolean(process.env[name]),
    )
  )
    throw new Halt("UNSAFE_RUNTIME_INSTRUMENTATION");
  const config = liveConfiguration();
  emit(
    "B2A: cuenta de prueba USER1 existente seleccionada. No se muestra su correo.",
  );
  emit(
    "Solo Auth: dos logins, logout local, verificaciones; cleanup global opcional solo tras CASE 1.",
  );
  let password = await noEchoPrompt(
    "Contraseña de USER1 (sin eco; Ctrl+C cancela): ",
  );
  if (!password) throw new Halt("EMPTY_OWNER_INPUT");
  const sensitive = [password, config.email, config.expectedUserId],
    result = newResult(dry, true);
  const nativeFetch = globalThis.fetch;
  try {
    await experiment(
      deps,
      { email: config.email, password, expectedUserId: config.expectedUserId },
      config.key,
      (url, init) => nativeFetch(url, init),
      result,
      sensitive,
      writeEvidence,
      true,
    );
    const safe = sanitized(result, sensitive);
    emit(safe);
    emit(
      result.finalCase === "CASE 1"
        ? "D2-008B2A = AUTH_USER_ONLY VERIFIED FOR CURRENT SUPABASE BEHAVIOR"
        : "OWNER REVIEW REQUIRED",
    );
    if (result.finalCase !== "CASE 1") process.exitCode = 3;
  } finally {
    password = "";
    sensitive.fill("");
    sensitive.length = 0;
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    emit(
      error instanceof Halt && error.reason === "OWNER_INPUT_METHOD_REQUIRED"
        ? "B2A LIVE RUN READY — OWNER INPUT METHOD REQUIRED"
        : "B2A STOPPED — SAFE LOCAL REVIEW REQUIRED; no raw error logged",
    );
    process.exitCode = 2;
  });
}
