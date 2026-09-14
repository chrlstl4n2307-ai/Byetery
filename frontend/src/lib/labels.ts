import type { BatteryState, RewardState, Role } from "./types";

const physical: Record<BatteryState, string> = {
  REGISTERED: "Registrada",
  RETURNED: "Devolución solicitada",
  COLLECTED: "Recolectada",
  RECYCLED: "Reciclada",
};
const rewards: Record<RewardState, string> = {
  NOT_ELIGIBLE: "No disponible",
  PENDING: "Pendiente",
  SENT: "Enviada",
};
const roles: Record<Role, string> = {
  USER: "Usuario",
  ADMIN: "Administrador",
  COLLECTOR: "Recolector",
  RECYCLER: "Reciclador",
};
export const physicalLabel = (state: BatteryState | null) =>
  state ? physical[state] : "Sin confirmar";
export const rewardLabel = (state: RewardState | null) =>
  state ? rewards[state] : "Sin confirmar";
export const roleLabel = (role: Role) => roles[role];
