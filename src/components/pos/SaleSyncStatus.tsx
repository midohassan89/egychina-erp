import type { SaleSyncStatus } from "@/types/woocommerce";

/** 🟢 when the ticket reached the server, 🟡 while it is still queued locally. */
export function SaleSyncStatusBadge({
  status,
  variant = "light",
}: {
  status: SaleSyncStatus;
  variant?: "light" | "dark";
}) {
  const synced = status === "synced";
  const light = variant === "light";
  const className = synced
    ? light
      ? "bg-emerald-50 text-emerald-800"
      : "bg-emerald-500/15 text-emerald-200"
    : light
      ? "bg-amber-50 text-amber-800"
      : "bg-amber-400/15 text-amber-100";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${className}`}
    >
      {synced ? "🟢 Synced" : "🟡 Pending"}
    </span>
  );
}
