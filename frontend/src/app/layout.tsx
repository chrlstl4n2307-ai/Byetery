import type { Metadata } from "next";
import { SessionProvider, Shell } from "@/components/session";
import "./globals.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Byetery · Cada batería cuenta",
  description:
    "Trazabilidad de baterías y recompensas simuladas. Entorno DEV / MOCK.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <a className="skip" href="#main">
          Saltar al contenido
        </a>
        <SessionProvider>
          <Shell>{children}</Shell>
        </SessionProvider>
      </body>
    </html>
  );
}
