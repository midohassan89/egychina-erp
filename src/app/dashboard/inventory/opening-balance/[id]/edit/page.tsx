"use client";

import { useParams } from "next/navigation";
import { OpeningBalanceEditor } from "@/components/dashboard/OpeningBalanceSheet";

export default function EditOpeningBalancePage() {
  const params = useParams<{ id: string }>();
  const documentId = Array.isArray(params.id) ? params.id[0] : params.id;
  if (!documentId) return null;
  return <OpeningBalanceEditor documentId={documentId} />;
}
