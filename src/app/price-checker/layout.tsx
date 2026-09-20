import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "استعلام السعر · Souq El Obour",
  description: "Customer-facing barcode price checker kiosk",
  robots: { index: false, follow: false },
};

export default function PriceCheckerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
