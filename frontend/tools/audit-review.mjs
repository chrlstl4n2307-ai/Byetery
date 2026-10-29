import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { builtinModules } from "node:module";
import { StrKey } from "@stellar/stellar-base";
import { REVIEW_PAGES, REVIEW_ROUTES } from "../src/shared/review/model.ts";
const root = fileURLToPath(new URL("../", import.meta.url));
function files(dir) { return !fs.existsSync(dir) ? [] : fs.readdirSync(dir, { withFileTypes: true }).flatMap(x => x.isDirectory() ? files(path.join(dir, x.name)) : [path.join(dir, x.name)]); }
function demand(value, label) { if (!value) throw Error(label); }
export function sourceAudit() {
 const opts = ts.parseJsonConfigFileContent(JSON.parse(fs.readFileSync(path.join(root, "tsconfig.json"), "utf8")), ts.sys, root).options;
 for (const targets of Object.values(opts.paths ?? {})) for (const target of targets) demand(path.resolve(root, target).startsWith(root), "AliasOutsideFrontend");
 for (const file of files(path.join(root, "src")).filter(f => /\.[cm]?[jt]sx?$/.test(f))) {
  const text = fs.readFileSync(file, "utf8"), rel = path.relative(root, file).replaceAll("\\", "/");
  if (rel.startsWith("src/server/direct-review/")) demand(/import\s+["']server-only["']/.test(text), "MissingServerOnly:" + rel);
  demand(!/\b(?:Keypair|TransactionBuilder)\b|\.sign\s*\(|signEnvelope|sendTransaction|submitTransaction|fromSecret/.test(text), "ForbiddenOwnCode:" + rel);
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  function check(spec) {
   demand(!/backend|child_process|stellar-sdk|secure.store|signer/i.test(spec), "ForbiddenImport:" + rel);
   if (builtinModules.includes(spec.replace(/^node:/, ""))) return;
   if (/\.css$/.test(spec)) { demand(path.resolve(path.dirname(file), spec).startsWith(root), "StylesheetOutsideFrontend"); return; }
   const resolved = ts.resolveModuleName(spec, file, opts, ts.sys).resolvedModule;
   demand(resolved, "UnresolvedImport:" + rel);
   if (!resolved.isExternalLibraryImport) demand(fs.realpathSync(resolved.resolvedFileName).startsWith(root), "ImportOutsideFrontend:" + rel);
   if (rel.startsWith("src/shared/review/")) demand(!/server|server-only/.test(spec), "SharedImportsServer:" + rel);
  }
  function walk(node) {
   if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) check(node.moduleSpecifier.text);
   if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
    demand(node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]), "NonLiteralDynamicImport:" + rel); check(node.arguments[0].text);
   }
   ts.forEachChild(node, walk);
  }
  walk(tree);
 }
 return { frontendOutsideImports: 0, forbiddenOwnCode: 0, serverMarkers: "PASS" };
}
export function buildAudit() {
 const manifest = JSON.parse(fs.readFileSync(path.join(root, ".next/server/app-paths-manifest.json"), "utf8"));
 const normalize = x => x.replace(/\/(?:page|route)$/, "").replaceAll(":batteryId", "[batteryId]").replaceAll(":operationId", "[operationId]") || "/";
 const actual = Object.keys(manifest).map(normalize).filter(x => !["/_not-found", "/_global-error"].includes(x)).sort();
 const expected = [...REVIEW_PAGES, ...REVIEW_ROUTES.map(r => normalize(r.path))].sort();
 demand(JSON.stringify(actual) === JSON.stringify(expected), "UnexpectedReviewRoutes:" + JSON.stringify(actual));
 demand(!Object.keys(manifest).some(x => x.includes("...")), "CatchAllInReviewBuild");
 const actions = JSON.parse(fs.readFileSync(path.join(root, ".next/server/server-reference-manifest.json"), "utf8"));
 demand(Object.keys(actions.node ?? {}).length === 0 && Object.keys(actions.edge ?? {}).length === 0, "UnexpectedServerAction");
 const browser = files(path.join(root, ".next/static")).filter(f => /\.(js|map)$/.test(f));
 for (const f of browser) demand(!/@stellar|stellar-base|stellar-sdk|ed25519|js-xdr|Keypair|fromSecret|TransactionBuilder|signEnvelope/.test(fs.readFileSync(f, "utf8")), "StellarInBrowserChunk:" + path.relative(root, f));
 return { routeManifest: "PASS", serverActionCount: 0, browserChunks: browser.length, browserStellarCode: 0 };
}
export function secretAudit() {
 const inspected = [...files(path.join(root, "src")), ...files(path.join(root, ".next/server")), ...files(path.join(root, ".next/static"))];
 let candidates = 0;
 for (const file of inspected) {
  const text = fs.readFileSync(file).toString("utf8");
  for (const match of text.matchAll(/S[A-Z2-7]{55}/g)) { candidates++; demand(!StrKey.isValidEd25519SecretSeed(match[0]), "ValidSecretInArtifact:" + path.relative(root, file)); }
 }
 return { inspectedFiles: inspected.length, candidatesChecksumValidated: candidates, validSecrets: 0 };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 const result = { source: sourceAudit(), ...(process.argv.includes("--source-only") ? {} : { build: buildAudit() }), secrets: secretAudit() };
 console.log(JSON.stringify(result, null, 2));
}
