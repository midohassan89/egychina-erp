import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signDriverToken } from "@/lib/driver/auth";

/**
 * POST /api/driver/login
 * Body: { username, password }
 * Returns bearer token for DRIVER role only.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      username?: unknown;
      password?: unknown;
    };
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");

    if (!username || !password) {
      return NextResponse.json(
        { error: "username and password are required" },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || user.status !== "ACTIVE" || user.role !== "DRIVER") {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = signDriverToken(user.id);
    return NextResponse.json({
      ok: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("[api/driver/login]", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
