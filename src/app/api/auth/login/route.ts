import { NextResponse } from "next/server";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/auth/login
 * Signs in via Auth.js, then returns user info from the DB
 * (does NOT call auth() afterward — that races the session cookie).
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      username?: string;
      password?: string;
    };

    const username = body.username?.trim();
    const password = body.password ?? "";

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required." },
        { status: 400 },
      );
    }

    await signIn("credentials", {
      username,
      password,
      redirect: false,
    });

    // Read role from DB — session cookie is set by signIn but not yet
    // visible to auth() in this same request.
    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, role: true, status: true },
    });

    if (!user || user.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Invalid username or password." },
        { status: 401 },
      );
    }

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: "Invalid username or password." },
        { status: 401 },
      );
    }
    console.error("[auth/login]", error);
    return NextResponse.json(
      { error: "Authentication failed." },
      { status: 500 },
    );
  }
}
