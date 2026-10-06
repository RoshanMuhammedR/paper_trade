import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireUser();
  if (!auth) redirect("/login");
  return <AppShell>{children}</AppShell>;
}
