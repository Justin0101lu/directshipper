import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
export default async function Layout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect("/signin");
  return <AppShell>{children}</AppShell>;
}
