import { NextResponse } from "next/server";

// Xenon 1 — Health probe
// سبک و بدون دیتابیس: فقط برای نشانگر اتصال کلاینت و مانیتورینگ گیت‌وی
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { ok: true, service: "xenon-1", ts: Date.now() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
