"use client";
import { createContext, useContext, type ReactNode } from "react";
import {
  localRuntime,
  type BlockchainSource,
  type WebRuntime,
} from "@/lib/web-config";
const Runtime = createContext<WebRuntime>(localRuntime);
export function WebRuntimeProvider({
  value,
  children,
}: {
  value: WebRuntime;
  children: ReactNode;
}) {
  return <Runtime.Provider value={value}>{children}</Runtime.Provider>;
}
export const useWebRuntime = () => useContext(Runtime);
export function NetworkIndicator({ source }: { source: BlockchainSource }) {
  const runtime = useWebRuntime();
  return (
    <div className="environment">
      <span>
        Environment: <b>{runtime.environment}</b>
      </span>
      {source === "TESTNET" ? (
        <span>
          NETWORK: <b>STELLAR TESTNET</b>
        </span>
      ) : (
        <span>
          Blockchain source: <b>MOCK</b>
        </span>
      )}
      {source === "TESTNET" && (
        <span>
          {runtime.environment === "D2_PREVIEW"
            ? "D2 PREVIEW — TESTNET READ/VERIFICATION"
            : "TESTNET READ/VERIFICATION — LOCAL"}
        </span>
      )}
    </div>
  );
}
