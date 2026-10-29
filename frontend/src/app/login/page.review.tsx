import "server-only";
import {ReviewLogin} from "@/components/review-actions";
export const dynamic="force-dynamic";
export default function Page(){return <section className="panel"><h1>Acceso de revisión</h1><ReviewLogin /></section>;}
