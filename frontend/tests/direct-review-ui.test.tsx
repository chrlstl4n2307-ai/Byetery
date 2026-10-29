import { expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ReviewProfileView, ReviewBatteryView } from "@/components/review-view";
import { CreateReviewIntent } from "@/components/review-actions";
import { battery, profile } from "./review-fixture";
import type { ReviewRole } from "@/shared/review/model";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
for (const role of ["USER", "ADMIN", "COLLECTOR", "RECYCLER"] as ReviewRole[]) it("role-specific read UI, no operational mutation controls: " + role, () => {
 render(<ReviewProfileView profile={{ ...profile, roles: [role], canCreateIntent: role === "ADMIN" }} />);
 expect(screen.getByText(role)).toBeTruthy(); expect(screen.getByText(/acciones operativas se demuestran/)).toBeTruthy();
 expect(screen.queryByText("Crear intención de revisión") !== null).toBe(role === "ADMIN");
 for (const word of ["Enviar recompensa", "Confirmar recolección", "Confirmar reciclaje", "Solicitar devolución", "Vincular wallet"]) expect(screen.queryByText(word)).toBeNull();
});
it("ADMIN cannot see create control without effective permission", () => {
 render(<ReviewProfileView profile={{ ...profile, canCreateIntent: false }} />); expect(screen.queryByText("Crear intención de revisión")).toBeNull();
});
it("three lanes retain durable recycled/sent state separately from network expiration", () => {
 render(<ReviewBatteryView battery={battery} verification={{ status: "STATE_EXPIRED", reason: "FIXTURE", verifiedAt: new Date().toISOString() }} />);
 expect(screen.getByText("RECYCLED")).toBeTruthy(); expect(screen.getByText("SENT")).toBeTruthy(); expect(screen.getByText("STATE_EXPIRED")).toBeTruthy(); expect(screen.getByText("Sin operación pendiente")).toBeTruthy();
});
it("OutcomeUnknown retries exact same key and payload, never replacement", async () => {
 const mock = vi.fn().mockImplementation(async () => Response.json({ error: { code: "OutcomeUnknown" } }, { status: 503 })); vi.stubGlobal("fetch", mock);
 render(<CreateReviewIntent />); fireEvent.click(screen.getByText("Crear intención de revisión"));
 await screen.findByText("Reintentar la misma intención"); fireEvent.click(screen.getByText("Reintentar la misma intención"));
 await waitFor(() => expect(mock).toHaveBeenCalledTimes(2));
 expect(mock.mock.calls[0][1].headers["Idempotency-Key"]).toBe(mock.mock.calls[1][1].headers["Idempotency-Key"]);
 expect(mock.mock.calls[0][1].body).toBe(mock.mock.calls[1][1].body);
});
