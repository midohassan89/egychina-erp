import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isManagerOrAdmin } from "@/lib/auth/roles";

export default async function CustomersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user || !isManagerOrAdmin(session.user.role)) {
    redirect("/dashboard");
  }
  return children;
}
