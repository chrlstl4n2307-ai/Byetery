export const DEPLOYMENT = "5c0cad2f-5f25-4216-8068-6cb9d2d26325";
export const CONTRACT = "CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON";
export const WASM = "c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6";
export const PASSPHRASE = "Test SDF Network ; September 2015";
export const NETWORK_ID = "cee0302d59844d32bdca915c8203dd44b33fbb7edc19051ea37abedf28ecd472";
export type ReviewRole = "USER" | "ADMIN" | "COLLECTOR" | "RECYCLER";
export type EventKind = "REGISTERED" | "RETURNED" | "COLLECTED" | "RECYCLED" | "REWARD" | "CANCELLED" | "OTHER";
export type VerificationState = "VERIFIED" | "UNVERIFIED" | "RETENTION_UNAVAILABLE" | "MISMATCH" | "STATE_EXPIRED" | "NETWORK_RESET";
export interface Verification { status: VerificationState; reason: string; verifiedAt: string; confirmedAt?: string; }
export interface ReviewOperation {
 operationId: string; kind: EventKind; status: string; transactionHash: string | null;
 ledger: number | null; createdAt: string; updatedAt: string | null; errorCode: string | null;
}
export interface ReviewProfile { roles: ReviewRole[]; canCreateIntent: boolean; batteries: string[]; source: "TESTNET"; deploymentId: string; }
export interface ReviewBattery {
 batteryId: string; confirmedBatteryState: "REGISTERED" | "RETURNED" | "COLLECTED" | "RECYCLED" | null;
 confirmedRewardState: "NOT_ELIGIBLE" | "PENDING" | "SENT" | null;
 pendingOperation: ReviewOperation | null; latestTerminalOperation: ReviewOperation | null;
 lastAttempt: { state: string; errorCode: string | null } | null;
 metadata: { type?: string; manufacturer?: string; batch?: string };
 ownRequest: { requestId: string; reservationState: string; requestState: string | null } | null;
 source: "TESTNET"; deploymentId: string;
}
export interface HistoryRow extends ReviewOperation {
 revision: number | null; payloadHash: string | null; commitment: string | null;
 identityContract: string | null; identityNetwork: string | null; requestId: string | null;
}
export interface ReviewHistory { batteryId: string; source: "TESTNET"; deploymentId: string; entries: (HistoryRow & { verification: Verification })[]; }
export interface RegistrationIntent {
 operationId: string; batteryId: string; registrationHash: string; status: "WAITING" | "ADOPTED";
 adoptedOperationId: string | null; createdAt: string; adoptedAt: string | null;
 transactionHash: null; source: "TESTNET"; deploymentId: string;
}
export const REVIEW_ROUTES = [
 { path: "/api/me", methods: ["GET"] },
 { path: "/api/batteries/:batteryId", methods: ["GET"] },
 { path: "/api/batteries/:batteryId/history", methods: ["GET"] },
 { path: "/api/review/registration-intents/:operationId", methods: ["GET"] },
 { path: "/api/review/registration-intents", methods: ["POST"] },
 { path: "/auth/login", methods: ["POST"] },
 { path: "/auth/logout", methods: ["POST"] },
] as const;
export const REVIEW_PAGES = ["/", "/login", "/dashboard", "/admin", "/collector", "/recycler", "/battery/[batteryId]", "/review/evidence"] as const;
export const REVIEW_FORBIDDEN_ENV = ["BYETERY_API_URL", "BYETERY_ALLOWED_API_ORIGINS", "BYETERY_LOCAL_TESTNET_MUTATIONS", "DATABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"] as const;
export const REVIEW_FORBIDDEN_ENV_PATTERN = /SIGNER|SECURE_STORE|MNEMONIC|SEED|(?:STELLAR|WALLET).*?(?:SECRET|PRIVATE)|^BYETERY_.*(?:UPSTREAM|LOCAL.*MUTAT|MOCK)|^NEXT_PUBLIC_.*(?:DATABASE|SECRET|SERVICE_ROLE|PRIVATE|TOKEN)/i;
