import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";

const CATEGORIES = [
  { name: "أجبان ومصنعات", slug: "cheese-deli" },
  { name: "مكرونة ونشويات", slug: "pasta-carbs" },
  { name: "عصائر ومشروبات", slug: "drinks-juices" },
  { name: "سناكس ومنتجات صينية", slug: "snacks-chinese" },
  { name: "بقالة وزيوت", slug: "groceries-oils" },
  { name: "أخرى", slug: "others" },
] as const;

const RULES: { slug: (typeof CATEGORIES)[number]["slug"]; keywords: string[] }[] = [
  {
    slug: "pasta-carbs",
    keywords: ["مكرونة", "لمتنا", "اسباجتي", "ارز", "أرز", "دقيق"],
  },
  {
    slug: "cheese-deli",
    keywords: ["جبن", "رومي", "بطارخ", "براميلي", "فلمنك", "بسطرمة", "لانشون", "بيف"],
  },
  {
    slug: "drinks-juices",
    keywords: ["عصير", "مانجو", "مياه", "بيبسي", "بن", "قهوة"],
  },
  {
    slug: "snacks-chinese",
    keywords: ["اندومي", "إندومي", "شيبسي", "بسكويت", "شوكولاتة", "لاتياو", "صيني"],
  },
  {
    slug: "groceries-oils",
    keywords: ["زيت", "سكر", "سمنة", "صلصة", "فول", "تونة"],
  },
];

function normalizeArabic(value: string): string {
  return value
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase();
}

const NORMALIZED_RULES = RULES.map((rule) => ({
  slug: rule.slug,
  keywords: rule.keywords.map(normalizeArabic),
}));

function categorySlugForName(name: string): (typeof CATEGORIES)[number]["slug"] {
  const haystack = normalizeArabic(name);
  for (const rule of NORMALIZED_RULES) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword))) {
      return rule.slug;
    }
  }
  return "others";
}

function chunks<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    groups.push(items.slice(i, i + size));
  }
  return groups;
}

/** GET /api/admin/categorize-products — one-time category seed and name matching. */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const categoryIds = new Map<string, string>();
  for (const category of CATEGORIES) {
    const saved = await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name },
      create: category,
    });
    categoryIds.set(category.slug, saved.id);
  }

  const products = await prisma.product.findMany({
    select: { id: true, name: true },
  });

  const idsBySlug = new Map<string, string[]>();
  for (const product of products) {
    const slug = categorySlugForName(product.name);
    const bucket = idsBySlug.get(slug) ?? [];
    bucket.push(product.id);
    idsBySlug.set(slug, bucket);
  }

  const writes = [...idsBySlug.entries()].flatMap(([slug, ids]) =>
    chunks(ids, 400).map((batch) =>
      prisma.product.updateMany({
        where: { id: { in: batch } },
        data: { categoryId: categoryIds.get(slug) },
      }),
    ),
  );

  await prisma.$transaction(writes);

  const counts = Object.fromEntries(
    CATEGORIES.map((category) => [
      category.name,
      idsBySlug.get(category.slug)?.length ?? 0,
    ]),
  );

  return NextResponse.json({
    success: true,
    message: "تم تصنيف المنتجات وربطها بالأقسام",
    updated: products.length,
    counts,
  });
}
