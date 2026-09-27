import { prisma } from "@/lib/prisma";
import { AutoImageList } from "./AutoImageList";

export default async function AutoImagesPage() {
  const products = await prisma.product.findMany({
    where: {
      isDeleted: false,
      OR: [{ imageUrl: null }, { imageUrl: "" }],
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex-1 space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">جلب صور المنتجات</h1>
        <p className="mt-1 text-sm text-slate-500">
          Products with no image. Each fetch searches Google Images and saves the URL.
        </p>
      </div>
      <AutoImageList products={products} />
    </div>
  );
}
