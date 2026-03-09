import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { sendCreatedEmail } from "@/app/lib/email";

async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cs) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
      },
    }
  );
}

// GET /api/reservations
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("reservations")
    .select("*, plans(name)")
    .eq("user_id", user.id)
    .order("start_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ items: data });
}

// POST /api/reservations
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  // 予約を作成
  const { data, error } = await supabase
    .from("reservations")
    .insert({
        youtube_broadcast_url: body.youtube_broadcast_url ?? null,
  twitch_channel_url: body.twitch_channel_url ?? null,
user_id:     user.id,
      name:        body.name,
      plan_key:    body.plan_key,
      start_at:    body.start_at,
      end_at:      body.end_at,
      stream_url:  body.stream_url  ?? null,
      obs_scene:   body.obs_scene   ?? null,
      notes:       body.notes       ?? null,
      total_price: body.total_price,
      status:      "pending",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // プラン名を取得してメール送信（失敗してもレスポンスには影響させない）
  try {
    const { data: plan } = await supabase
      .from("plans")
      .select("name")
      .eq("key", body.plan_key)
      .single();

    await sendCreatedEmail(user.email!, {
      name:       body.name,
      planName:   plan?.name ?? body.plan_key,
      startAt:    body.start_at,
      endAt:      body.end_at,
      totalPrice: body.total_price,
      streamUrl:  body.stream_url,
      obsScene:   body.obs_scene,
      notes:      body.notes,
    });
    console.log("[email] 予約受付メール送信:", user.email);
  } catch (emailErr) {
    console.error("[email] 送信エラー（予約は作成済み）:", emailErr);
  }

  return NextResponse.json({ item: data }, { status: 201 });
}
