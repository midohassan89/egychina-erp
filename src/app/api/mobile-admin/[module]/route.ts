import {
  dispatchMobileAdminModule,
} from "@/lib/mobile-admin/handlers";
import { requireMobileAdmin } from "@/lib/pos/mobileAdminAuth";
import {
  mobilePosError,
  mobilePosJson,
  mobilePosOptions,
} from "@/lib/pos/mobilePosCors";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ module: string }>;
};

export async function OPTIONS() {
  return mobilePosOptions();
}

/**
 * Canonical mobile-admin envelope:
 * { ok: true, items: T[], data: T[], stats: {...}, ...extras }
 */
function envelope(
  moduleName: string,
  result: {
    items?: unknown[];
    stats?: Record<string, unknown>;
    data?: Record<string, unknown>;
  },
  status = 200,
) {
  const items = Array.isArray(result.items) ? result.items : [];
  const stats = result.stats ?? { count: items.length };
  const extras =
    result.data && typeof result.data === "object" ? result.data : {};

  return mobilePosJson(
    {
      ok: true,
      module: moduleName.trim().toLowerCase(),
      items,
      data: items,
      stats,
      count: items.length,
      ...extras,
    },
    status,
  );
}

async function handle(
  request: Request,
  context: RouteContext,
  method: string,
) {
  try {
    const user = await requireMobileAdmin(request);
    if (!user) {
      return mobilePosError("غير مصرح — يرجى تسجيل الدخول مجدداً", 401);
    }

    const { module: moduleName } = await context.params;
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    let body: Record<string, unknown> = {};
    if (method === "POST" || method === "PATCH" || method === "DELETE") {
      try {
        const raw = await request.json();
        if (raw && typeof raw === "object" && !Array.isArray(raw)) {
          body = raw as Record<string, unknown>;
        }
      } catch {
        if (method !== "DELETE") {
          return mobilePosError("جسم الطلب غير صالح (JSON)", 400);
        }
      }
    }

    const result = await dispatchMobileAdminModule(moduleName, {
      user,
      method,
      body,
      searchParams: url.searchParams,
      id,
    });

    if (!result.ok) {
      return mobilePosError(result.error, result.status);
    }

    return envelope(moduleName, result, result.status ?? 200);
  } catch (error) {
    console.error(`[api/mobile-admin] ${method}`, error);
    return mobilePosError("تعذر تنفيذ الطلب. حاول مرة أخرى", 500);
  }
}

export async function GET(request: Request, context: RouteContext) {
  return handle(request, context, "GET");
}

export async function POST(request: Request, context: RouteContext) {
  return handle(request, context, "POST");
}

export async function PATCH(request: Request, context: RouteContext) {
  return handle(request, context, "PATCH");
}

export async function DELETE(request: Request, context: RouteContext) {
  return handle(request, context, "DELETE");
}
