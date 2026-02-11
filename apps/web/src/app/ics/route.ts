import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiBaseURL } from "@/lib/backend";

export async function GET(req: NextRequest) {
  const token = (req.nextUrl.searchParams.get("token") || "").trim();
  if (!token) return new NextResponse("not found", { status: 404 });

  const windowDays = (req.nextUrl.searchParams.get("window_days") || "").trim();
  const qp = new URLSearchParams({ token });
  if (windowDays) qp.set("window_days", windowDays);

  const resp = await fetch(apiBaseURL() + "/api/v1/integrations/calendar/ics?" + qp.toString(), {
    method: "GET",
    cache: "no-store",
  });

  if (!resp.ok) {
    return new NextResponse("not found", { status: 404 });
  }

  return new NextResponse(resp.body, {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      // Google Calendar fetches this like a file.
      "content-disposition": 'inline; filename="preptracker.ics"',
    },
  });
}

