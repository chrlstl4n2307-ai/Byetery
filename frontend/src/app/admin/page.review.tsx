import "server-only";
import {reviewPage} from "@/server/direct-review/pages";
export const dynamic="force-dynamic";
export default function Page(){return reviewPage("ADMIN");}
