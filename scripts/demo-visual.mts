/** Real browser -> Next HTTP -> existing API -> Supabase DEV + durable MOCK.
 * Ephemeral credentials and Ed25519 keys are retained in this Node process only. */
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import {
  chromium,
  expect as baseExpect,
  type Page,
} from "../frontend/node_modules/@playwright/test/index.mjs";
import {
  fixture,
  authRequest,
} from "../backend/src/application/dev-fixture.ts";
const expect = baseExpect.configure({ timeout: 45000 });
const root = resolve(import.meta.dirname, "..");
const f = await fixture();
const credentials: Record<string, { email: string; password: string }> = {};
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let child: ReturnType<typeof spawn> | undefined;
try {
  for (const name of ["a", "admin", "collector", "recycler"]) {
    const password = randomBytes(32).toString("base64url") + "aA1!";
    const u = await authRequest(
      f.config,
      "/admin/users/" + f.users[name].id,
      "PUT",
      { password },
    );
    credentials[name] = { email: u.email ?? u.user?.email, password };
  }
  child = spawn(
    process.execPath,
    [
      resolve(root, "frontend/node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3000",
    ],
    {
      cwd: resolve(root, "frontend"),
      windowsHide: true,
      stdio: "ignore",
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: "1",
        BYETERY_WEB_ORIGIN: "http://127.0.0.1:3000",
        BYETERY_API_URL: f.base,
        SUPABASE_URL: f.config.url,
        SUPABASE_PUBLISHABLE_KEY: f.config.publicKey,
      },
    },
  );
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw new Error("Next process exited");
    try {
      if ((await fetch("http://127.0.0.1:3000/login")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.ok(ready, "Next server starts");
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const consoleErrors: string[] = [];
  const pages: Record<string, Page> = {};
  for (const name of ["a", "admin", "collector", "recycler"]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    pages[name] = page;
    page.on("pageerror", () => consoleErrors.push("Browser runtime error"));
    await page.goto("http://127.0.0.1:3000/login");
    await page.getByLabel("Correo electrónico").fill(credentials[name].email);
    await page.getByLabel("Contraseña").fill(credentials[name].password);
    await page
      .getByRole("button", { name: "Iniciar sesión", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Tu actividad circular" }),
    ).toBeVisible({ timeout: 45000 });
    const cookies = await context.cookies();
    assert.ok(
      cookies.filter((c) => c.name.startsWith("sb-")).every((c) => c.httpOnly),
    );
  }
  const { a, admin, collector, recycler } = pages,
    id = "BYE-" + randomBytes(7).toString("hex").toUpperCase();
  await admin.goto("http://127.0.0.1:3000/admin");
  await admin.getByLabel("Battery ID", { exact: true }).fill(id);
  await admin.getByLabel("Tipo", { exact: true }).fill("Pila AA alcalina");
  await admin.getByLabel("Marca / fabricante").fill("Demo circular");
  await admin.getByLabel("Lote", { exact: true }).fill("DEV-2026");
  await admin
    .getByRole("button", { name: "Registrar batería", exact: true })
    .click();
  await expect(
    admin.getByText("Operación confirmada por la API.", { exact: true }),
  ).toBeVisible({ timeout: 45000 });
  console.log(id + "\nREGISTERED ✓");
  await a.getByLabel("Dirección pública G…").fill(f.users.a.key.publicKey());
  await a.getByRole("button", { name: "Solicitar challenge" }).click();
  const message = await a
    .getByLabel("Mensaje Base64")
    .inputValue({ timeout: 30000 });
  const signature = Buffer.from(
    f.users.a.key.sign(Buffer.from(message, "base64")),
  ).toString("base64");
  await a.getByLabel("Firma Ed25519 en Base64").fill(signature);
  await a.getByRole("button", { name: "Verificar firma" }).click();
  await expect(
    a.getByRole("heading", { name: "Wallet verificada ✓" }),
  ).toBeVisible({ timeout: 45000 });
  await a.getByLabel("Consultar una batería").fill(id);
  await a.getByRole("button", { name: "Buscar batería →" }).click();
  await a.getByRole("button", { name: "Solicitar devolución" }).click();
  await expect(
    a.getByRole("button", { name: "Cancelar devolución" }),
  ).toBeVisible({ timeout: 45000 });
  const rid = await a.locator(".request-code code").innerText();
  assert.match(rid, /^[a-f0-9]{64}$/);
  console.log("RETURNED ✓");
  for (const [page, path, button, state] of [
    [collector, "collector", "Confirmar recepción física", "COLLECTED"],
    [recycler, "recycler", "Confirmar reciclaje", "RECYCLED"],
  ] as const) {
    await page.goto("http://127.0.0.1:3000/" + path);
    await page.getByLabel("Battery ID", { exact: true }).fill(id);
    await page.getByLabel("Return Request ID").fill(rid);
    await page.getByRole("button", { name: "Consultar batería" }).click();
    await expect(
      page.getByRole("button", { name: button, exact: true }),
    ).toBeEnabled({ timeout: 30000 });
    await page.getByRole("button", { name: button, exact: true }).click();
    await expect(page.locator(".pill")).toHaveText(
      state === "COLLECTED" ? "RECOLECTADA" : "RECICLADA",
      { timeout: 45000 },
    );
    console.log(state + " ✓");
  }
  await expect(
    recycler.getByRole("heading", { name: "Pendiente", exact: true }),
  ).toBeVisible();
  await admin.goto("http://127.0.0.1:3000/battery/" + id);
  await admin.getByRole("button", { name: "Procesar recompensa DEV" }).click();
  await expect(
    admin.getByRole("heading", { name: "Enviada", exact: true }),
  ).toBeVisible({ timeout: 45000 });
  await a.reload();
  await expect(
    a.getByRole("heading", { name: "Enviada", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(a.getByText("Recompensa enviada ✓")).toBeVisible();
  await mkdir(resolve(root, ".tools/verification"), { recursive: true });
  await a.screenshot({
    path: resolve(root, ".tools/verification/frontend-desktop.png"),
    fullPage: true,
  });
  await a.setViewportSize({ width: 390, height: 844 });
  await a.screenshot({
    path: resolve(root, ".tools/verification/frontend-mobile.png"),
    fullPage: true,
  });
  assert.ok(
    await a.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "Mobile layout has no horizontal overflow",
  );
  await a.goto("http://127.0.0.1:3000/admin");
  await expect(
    a.getByRole("heading", { name: "Acceso restringido" }),
  ).toBeVisible();
  const denied = await a.request.post("http://127.0.0.1:3000/api/batteries", {
    headers: { Origin: "https://other.example" },
    data: { batteryId: "BYE-INVALID" },
  });
  assert.equal(denied.status(), 403);
  await a.getByLabel("Abrir menú de cuenta").click();
  await a.getByRole("button", { name: "Salir", exact: true }).click();
  await expect(a.getByRole("heading", { name: "Qué bueno verte" })).toBeVisible(
    { timeout: 30000 },
  );
  await a.goto("http://127.0.0.1:3000/dashboard");
  await expect(a.getByRole("heading", { name: "Qué bueno verte" })).toBeVisible(
    { timeout: 30000 },
  );
  assert.deepEqual(consoleErrors, [], "No browser runtime errors");
  console.log(
    "Reward: SENT\n10 GREEN-TEST\nSource: MOCK\nDatabase: SUPABASE DEV\nBrowser: Edge\nHttpOnly, role gate, Origin, logout, mobile: PASS",
  );
} finally {
  await browser?.close();
  if (child && child.exitCode === null) {
    const exited = once(child, "exit");
    child.kill();
    await exited;
  }
  await f.cleanup();
}
