import { NextResponse, type NextRequest } from "next/server";
import { getWearableSnapshot } from "@/lib/integrations/wearables.mock";
import { isValidSessionId } from "@/lib/utils/sanitize";
import { requireAuth } from "@/lib/auth/helpers";
import { saveHealthTwinServer, loadHealthTwinServer } from "@/lib/health-twin/server-storage";
import type { HealthTwinProfile } from "@/lib/health-twin/types";

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!authResult.authorized) return authResult.response;

  const sessionId = request.nextUrl.searchParams.get("sessionId");

  // Health Twin load endpoint: GET /api/wearable?healthTwin=1
  if (request.nextUrl.searchParams.get("healthTwin") === "1") {
    const profile = await loadHealthTwinServer(authResult.userId);
    return NextResponse.json({ success: true, healthTwin: profile });
  }

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

/** POST /api/wearable — save Health Twin to DynamoDB */
export async function POST(request: Request) {
  const authResult = await requireAuth();
  if (!authResult.authorized) return authResult.response;

  try {
    const body = await request.json() as { healthTwin?: HealthTwinProfile };
    if (!body.healthTwin) {
      return NextResponse.json({ error: "Missing healthTwin in body." }, { status: 400 });
    }

    await saveHealthTwinServer(authResult.userId, body.healthTwin);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to save Health Twin." }, { status: 500 });
  }
}
