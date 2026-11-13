// Candidate bindings only. A future composition commit/tree is deliberately absent.
export const COMPONENTS = Object.freeze({
  server: '21f5e3e7a27759d02a0477c374b7e37f35f96909',
  serverParent: '725d25202c9085882ef80904a669bd39f0f1b39d',
  operator: 'd85e54e00e98c8d8bc6294c883708a701ce55440',
  operatorParent: '4735b83a47d29ab8608f4ed8a1237e1fbe9c8636',
  capture: '496f891463c4476fe6f9e267232e072b754d02fb',
  captureParent: '725d25202c9085882ef80904a669bd39f0f1b39d',
});
export const COMPOSITION_COMMIT = null;
export const COMPOSITION_TREE = null;
export const CANDIDATE_ONLY = true;
export const SIGNER = Object.freeze({
  sourceCommit: COMPONENTS.server,
  // Recomputed after offline Cargo build from the exact source commit, not copied from an old authorization.
  binarySha256: '9710311d384345f8197e7d8635c75808930e74bdda5081d83c2aa21b302b1f10',
  bytes: 374949376,
  profile: 'dev-local-llvm-ucrt-strip-debuginfo',
  custodyRiskAccepted: false,
});
