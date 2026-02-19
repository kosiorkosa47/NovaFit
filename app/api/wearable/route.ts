import { NextResponse, type NextRequest } from "next/server";
import { getWearableSnapshot } from "@/lib/integrations/wearables.mock";
import { isValidSessionId } from "@/lib/utils/sanitize";
import { requireAuth } from "@/lib/auth/helpers";

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!authResult.authorized) return authResult.response;

  const sessionId = request.nextUrl.searchParams.get("sessionId");

  if (!sessionId || !isValidSessionId(sessionId)) {
    return NextResponse.json(
      { error: "Missing or invalid sessionId query parameter." },
      { status: 400 }
    );
  }

  try {
    const snapshot = await getWearableSnapshot(sessionId);
    return NextResponse.json(snapshot);
  } catch {
    return NextResponse.json(
      { error: "Failed to retrieve wearable data." },
      { status: 500 }
    );
  }
}
