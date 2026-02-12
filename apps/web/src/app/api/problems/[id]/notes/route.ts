import type { NextRequest } from "next/server";

import { proxyJSON } from "@/lib/backend";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyJSON({ method: "GET", path: `/api/v1/problems/${encodeURIComponent(id)}/notes` });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as unknown;
  return proxyJSON({ method: "PUT", path: `/api/v1/problems/${encodeURIComponent(id)}/notes`, body });
}

