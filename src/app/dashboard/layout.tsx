import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DashboardShell } from "@/components/layout/DashboardShell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (session.user.role === "CASHIER") redirect("/pos");

  return (
    <DashboardShell
      username={session.user.name ?? "User"}
      role={session.user.role}
    >
      {children}
    </DashboardShell>
  );
}
