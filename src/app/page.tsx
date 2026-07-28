import { redirect } from "next/navigation";
import { getCurrentActor } from "@/lib/auth";

export default async function RootPage() {
  const actor = await getCurrentActor();
  redirect(actor ? "/dashboard" : "/login");
}
