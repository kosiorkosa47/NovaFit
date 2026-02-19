import { NextResponse } from "next/server";
import { auth } from "./auth";

interface AuthResult {
  authorized: true;
  userId: string;
}

interface AuthFailure {
  authorized: false;
  response: NextResponse;
}

export async function requireAuth(): Promise<AuthResult | AuthFailure> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      authorized: false,
      response: NextResponse.json(
        { success: false, error: "Authentication required." },
        { status: 401 }
      ),
    };
  }

  return { authorized: true, userId: session.user.id };
}
