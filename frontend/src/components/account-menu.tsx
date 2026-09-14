"use client";
import type { Role } from "@/lib/types";
import { roleLabel } from "@/lib/labels";

export function AccountMenu({
  email,
  roles,
  onLogout,
}: {
  email?: string;
  roles: Role[];
  onLogout: () => void;
}) {
  const label =
    roles
      .filter((r) => r !== "USER")
      .map(roleLabel)
      .join(" · ") || "Usuario";
  return (
    <details
      className="account-menu"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }
      }}
    >
      <summary aria-label="Abrir menú de cuenta">
        <span className="avatar" aria-hidden="true">
          {email?.[0]?.toUpperCase() ?? "U"}
        </span>
        <span className="account-label">
          <strong>Mi cuenta</strong>
          <small>{label}</small>
        </span>
        <span aria-hidden="true">⌄</span>
      </summary>
      <div className="account-popover">
        <small>SESIÓN ACTIVA</small>
        <p>{email || "Cuenta autenticada"}</p>
        <p>{label}</p>
        <button className="text-button" onClick={onLogout}>
          Salir
        </button>
      </div>
    </details>
  );
}
