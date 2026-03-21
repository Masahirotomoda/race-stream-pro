import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/app/lib/admin";
import { createAdminClient } from "@/app/lib/supabase/admin-client";
import {
  sendConfirmedEmail,
  sendCancelledEmail,
  sendTimeChangedEmail,
} from "@/app/lib/email";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))


async function enqueueProvisionJob(admin: ReturnType<typeof createAdminClient>, reservationId: string) {
  // provision_status を queued にして job を追加
  await admin.from("reservations").update({ provision_status: "queued" }).eq("id", reservationId);
  await admin.from("provisioning_jobs").insert({
    reservation_id: reservationId,
    action: "provision",
    status: "queued",
    run_at: new Date().toISOString(),
  });
}

async function getUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cs: any[]) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
      },
    }
  );
  return (await supabase.auth.getUser()).data.user;
}

async function getReservationWithUser(admin: ReturnType<typeof createAdminClient>, id: string) {
  const { data: r } = await admin
    .from("reservations")
    .select("*, plans(name)")
    .eq("id", id)
    .single();
  if (!r) return null;

  const { data: userData } = await admin.auth.admin.getUserById(r.user_id);
  return { reservation: r, userEmail: userData?.user?.email ?? null };
}

// PUT /api/admin/reservations/[id]  時間・料金変更
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user || !isAdmin(user.email))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body   = await req.json();
  const admin  = createAdminClient();

  const { data, error } = await admin
    .from("reservations")
    .update({
      start_at:    body.start_at,
      end_at:      body.end_at,
      ...(typeof body.total_price === "number" ? { ...(typeof body.total_price === "number" ? { total_price: body.total_price } : {}) } : {}),
      ...(body.status ? { status: body.status } : {}),
    })
    .eq("id", id)
    .select("*, plans(name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // メール送信
  try {
    const info = await getReservationWithUser(admin, id);
    if (info?.userEmail) {
      const emailData = {
        name:       data.name,
        planName:   data.plans?.name ?? data.plan_key,
        startAt:    data.start_at,
        endAt:      data.end_at,
        totalPrice: data.total_price,
        streamUrl:  data.stream_url,
        obsScene:   data.obs_scene,
        notes:      data.notes,
      };

      if (body.status === "confirmed") {
        await sendConfirmedEmail(info.userEmail, emailData);
        console.log("[email] 予約確定メール送信:", info.userEmail);
      } else if (body.status === "cancelled") {
        await sendCancelledEmail(info.userEmail, emailData);
        console.log("[email] キャンセルメール送信:", info.userEmail);
      } else {
        // ステータス変更なし → 時間変更メール
        await sendTimeChangedEmail(info.userEmail, emailData);
        console.log("[email] 時間変更メール送信:", info.userEmail);
      }
    }
  } catch (emailErr: unknown) {
    console.error("[email] 送信エラー（更新は完了済み）:", emailErr);
  }

    // confirmed になったらプロビジョニング開始（1.A）
  try {
    if ((body?.status ?? null) === "confirmed") {
      await enqueueProvisionJob(admin, id);
      console.log("[provision] enqueued (PUT)", id);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[provision] enqueue failed (PUT)", msg)
  }


  return NextResponse.json({ item: data });
}

// PATCH /api/admin/reservations/[id]  ステータスのみ変更
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user || !isAdmin(user.email))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id }     = await params;
  const { status } = await req.json();
  const allowed    = ["pending", "confirmed", "cancelled"];
  if (!allowed.includes(status))
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("reservations")
    .update({ status })
    .eq("id", id)
    .select("*, plans(name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // メール送信
  try {
    const info = await getReservationWithUser(admin, id);
    if (info?.userEmail) {
      const emailData = {
        name:       data.name,
        planName:   data.plans?.name ?? data.plan_key,
        startAt:    data.start_at,
        endAt:      data.end_at,
        totalPrice: data.total_price,
        streamUrl:  data.stream_url,
        obsScene:   data.obs_scene,
        notes:      data.notes,
      };

      if (status === "confirmed") {
        await sendConfirmedEmail(info.userEmail, emailData);
        console.log("[email] 予約確定メール送信:", info.userEmail);
      } else if (status === "cancelled") {
        await sendCancelledEmail(info.userEmail, emailData);
        console.log("[email] キャンセルメール送信:", info.userEmail);
      }
    }
  } catch (emailErr: unknown) {
    console.error("[email] 送信エラー（更新は完了済み）:", emailErr);
  }

    // confirmed になったらプロビジョニング開始（1.A）
  try {
    if (status === "confirmed") {
      await enqueueProvisionJob(admin, id);
      console.log("[provision] enqueued (PATCH)", id);
    }
  } catch (e: unknown) {
    console.error("[provision] enqueue failed (PATCH)", errMsg(e));
  }

return NextResponse.json({ item: data });
}

// DELETE /api/admin/reservations/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user || !isAdmin(user.email))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id }  = await params;
  const admin   = createAdminClient();

  // 削除前にユーザーメールを取得
  let userEmail: string | null = null;
  let emailData: Parameters<typeof sendCancelledEmail>[1] | null = null;
  try {
    const info = await getReservationWithUser(admin, id);
    if (info) {
      userEmail = info.userEmail;
      emailData = {
        name:       info.reservation.name,
        planName:   info.reservation.plans?.name ?? info.reservation.plan_key,
        startAt:    info.reservation.start_at,
        endAt:      info.reservation.end_at,
        totalPrice: info.reservation.total_price,
        streamUrl:  info.reservation.stream_url,
        obsScene:   info.reservation.obs_scene,
        notes:      info.reservation.notes,
      };
    }
  } catch (_) {}

  const { error } = await admin.from("reservations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // 削除後にキャンセルメール送信
  if (userEmail && emailData) {
    try {
      await sendCancelledEmail(userEmail, emailData);
      console.log("[email] 削除通知メール送信:", userEmail);
    } catch (emailErr: unknown) {
      console.error("[email] 送信エラー:", emailErr);
    }
  }

  return NextResponse.json({ success: true });
}
