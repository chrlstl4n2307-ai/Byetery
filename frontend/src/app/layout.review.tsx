import "server-only";
import Link from "next/link";
import "./globals.css";
import {ReviewLogout} from "@/components/review-actions";
export const dynamic="force-dynamic";
export default function Layout({children}:{children:React.ReactNode}) {return <html lang="es"><body><header className="topbar"><Link className="brand" href="/dashboard">byetery.</Link><span>Environment: D2_PREVIEW · Blockchain source: TESTNET</span><ReviewLogout /></header><main id="main" className="shell">{children}</main></body></html>;}
