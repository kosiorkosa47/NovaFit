import { NextResponse, type NextRequest } from "next/server";
import { getWearableSnapshot } from "@/lib/integrations/wearables.mock";
import { isValidSessionId } from "@/lib/utils/sanitize";

export async function GET(request: NextRequest) {
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
