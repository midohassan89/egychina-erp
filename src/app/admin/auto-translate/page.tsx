import { prisma } from "@/lib/prisma";
import { AutoTranslateList, type TranslateRow } from "./AutoTranslateList";

const missingTranslation = {
  OR: [
    { nameEn: null },
    { nameEn: "" },
    { nameZh: null },
    { nameZh: "" },
  ],
};

export default async function AutoTranslatePage() {
  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where: { isDeleted: false, ...missingTranslation },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({
      where: missingTranslation,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const rows: TranslateRow[] = [
    ...categories.map((category) => ({
      type: "category" as const,
      id: category.id,
      name: category.name,
    })),
    ...products.map((product) => ({
      type: "product" as const,
      id: product.id,
      name: product.name,
    })),
  ];

  return (
    <div className="flex-1 space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">أداة الترجمة الآلية</h1>
        <p className="mt-1 text-sm text-slate-500">
          يترجم الاسم العربي إلى الإنجليزية والصينية ويحفظه على المنتج أو القسم.
        </p>
      </div>
      <AutoTranslateList rows={rows} />
    </div>
  );
}
