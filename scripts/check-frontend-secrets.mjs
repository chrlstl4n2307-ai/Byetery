import { readFile, readdir } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { parseEnv } from "node:util";
const root = resolve(import.meta.dirname, "..");
const env = parseEnv(await readFile(resolve(root, ".env"), "utf8"));
const local = parseEnv(
  await readFile(resolve(root, "frontend/.env.local"), "utf8"),
);
const allowed = new Set([
  "BYETERY_WEB_ORIGIN",
  "BYETERY_API_URL",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
]);
for (const key of Object.keys(local))
  if (!allowed.has(key))
    throw new Error("Unexpected frontend environment variable: " + key);
const secrets = Object.entries(env)
  .filter(
    ([k, v]) =>
      v &&
      /DATABASE_URL|SERVICE_ROLE|SECRET|PRIVATE|PASSWORD|ACCESS_TOKEN/.test(k),
  )
  .map(([, v]) => v);
if (env.DATABASE_URL)
  secrets.push(decodeURIComponent(new URL(env.DATABASE_URL).password));
const forbidden = [
  /sb_secret_[A-Za-z0-9_-]{15,}/,
  /\bS[A-Z2-7]{55}\b/,
  /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
let scanned = 0;
async function scan(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) await scan(path);
    else {
      const data = await readFile(path);
      const text = data.toString("utf8");
      if (
        secrets.some((s) => s.length > 8 && text.includes(s)) ||
        forbidden.some((p) => p.test(text))
      )
        throw new Error(
          "Sensitive material detected in " + relative(root, path),
        );
      scanned++;
    }
  }
}
await scan(resolve(root, "frontend/.next/static"));
console.log(
  `Frontend bundle audit: ${scanned} artifacts checked; no privileged secrets. Frontend env allowlist: PASS.`,
);
