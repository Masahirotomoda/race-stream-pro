import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { isAdmin } from "@/app/lib/admin";
import { createAdminClient } from "@/app/lib/supabase/admin-client";

export const runtime = "nodejs";

const RES_STATUSES = ["pending", "confirmed", "cancelled"] as const;
const PROV_STATUSES = ["none", "queued", "running", "ready", "failed"] as const;
const JOB_STATUSES = ["queued", "running", "succeeded", "failed"] as const;

async function countExact(admin: any, table: string, filters: Array<[string, string, any]> = []) {
  let q = admin.from(table).select("*", { count: "exact", head: true });

  for (const [op, col, val] of filters) {
    if (op === "eq") q = q.eq(col, val);
    else if (op === "lt") q = q.lt(col, val);
    else if (op === "gt") q = q.gt(col, val);
    else if (op === "not_is") q = q.not(col, "is", val);
  }

  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

async function countAllUsers(admin: any, maxUsers = 5000) {
  const perPage = 1000;
  let page = 1;
  let total = 0;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users ?? [];
    total += users.length;

    if (users.length < perPage) break;
    if (total >= maxUsers) break;

    page += 1;
  }

  return { total, capped: total >= maxUsers };
}

export async function GET() {
  // 認証（Cookieベース）
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cs: any[]) {
          cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email ?? null;
  if (!email || !isAdmin(email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  const nowIso = new Date().toISOString();
  const staleBorderIso = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15分前

  // ベース件数（軽量：count only）
  const reservationsTotalP = countExact(admin, "reservations");
  const jobsTotalP = countExact(admin, "provisioning_jobs");
  const resourcesTotalP = countExact(admin, "reservation_resources");

  // 予約 status 別（DBの生値）
  const byStatusP = Promise.all(RES_STATUSES.map(async (s) => [s, await countExact(admin, "reservations", [["eq", "status", s]])] as const));
  // 予約 provision_status 別
  const byProvP = Promise.all(PROV_STATUSES.map(async (s) => [s, await countExact(admin, "reservations", [["eq", "provision_status", s]])] as const));
  // ジョブ status 別
  const byJobP = Promise.all(JOB_STATUSES.map(async (s) => [s, await countExact(admin, "provisioning_jobs", [["eq", "status", s]])] as const));

  // ダッシュボード表示用：pending/approved/completed/cancelled の分布（DB変更なしで算出）
  // approved = confirmed かつ未終了、completed = confirmed かつ終了済み
  const pendingP = countExact(admin, "reservations", [["eq", "status", "pending"]]);
  const cancelledP = countExact(admin, "reservations", [["eq", "status", "cancelled"]]);
  const approvedP = countExact(admin, "reservations", [["eq", "status", "confirmed"], ["gt", "end_at", nowIso]]);
  const completedP = countExact(admin, "reservations", [["eq", "status", "confirmed"], ["lt", "end_at", nowIso]]);

  // stale running jobs（locked_at が古い）
  const staleRunningP = countExact(admin, "provisioning_jobs", [
    ["eq", "status", "running"],
    ["not_is", "locked_at", null],
    ["lt", "locked_at", staleBorderIso],
  ]).catch(() => 0);

  // upcoming confirmed（end_at > now）
  const upcomingConfirmedP = countExact(admin, "reservations", [
    ["eq", "status", "confirmed"],
    ["gt", "end_at", nowIso],
  ]);

  // リソース kind 別
  const srtCountP = countExact(admin, "reservation_resources", [["eq", "kind", "srt"]]);
  const winObsCountP = countExact(admin, "reservation_resources", [["eq", "kind", "windows_obs"]]);

  // 売上合計（小規模想定の簡易集計）
  const revenueRowsP = admin.from("reservations").select("total_price");

  // 直近データ
  const recentReservationsP = admin
    .from("reservations")
    .select("id, name, status, provision_status, plan_key, total_price, start_at, end_at, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  const recentJobsP = admin
    .from("provisioning_jobs")
    .select("id, reservation_id, action, status, attempts, locked_at, last_error, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  // ユーザー数
  const usersCountP = countAllUsers(admin);

  const [
    reservationsTotal,
    jobsTotal,
    resourcesTotal,
    byStatus,
    byProv,
    byJob,
    pending,
    approved,
    completed,
    cancelled,
    staleRunning,
    upcomingConfirmed,
    srtCount,
    winObsCount,
    revenueRows,
    recentReservations,
    recentJobs,
    usersCount,
  ] = await Promise.all([
    reservationsTotalP,
    jobsTotalP,
    resourcesTotalP,
    byStatusP,
    byProvP,
    byJobP,
    pendingP,
    approvedP,
    completedP,
    cancelledP,
    staleRunningP,
    upcomingConfirmedP,
    srtCountP,
    winObsCountP,
    revenueRowsP,
    recentReservationsP,
    recentJobsP,
    usersCountP,
  ]);

  const byStatusObj = Object.fromEntries(byStatus);
  const byProvObj = Object.fromEntries(byProv);
  const byJobObj = Object.fromEntries(byJob);

  const revenueYen = (revenueRows.data ?? []).reduce((sum: number, r: any) => sum + (Number(r.total_price) || 0), 0);
  const readyCount = byProvObj.ready ?? 0;
  const readyRate = reservationsTotal > 0 ? Math.round((readyCount / reservationsTotal) * 1000) / 10 : 0;

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    reservations: {
      total: reservationsTotal,
      byStatus: byStatusObj,
      byProvisionStatus: byProvObj,
      // 追加: pending/approved/completed/cancelled 分布
      statusDistribution: {
        pending,
        approved,
        completed,
        cancelled,
      },
      revenueYen,
      upcomingConfirmed,
      readyRatePercent: readyRate,
    },
    users: {
      total: usersCount.total,
      capped: usersCount.capped,
    },
    jobs: {
      total: jobsTotal,
      byStatus: byJobObj,
      staleRunning,
    },
    resources: {
      total: resourcesTotal,
      byKind: { srt: srtCount, windows_obs: winObsCount },
    },
    recent: {
      reservations: recentReservations.data ?? [],
      jobs: recentJobs.data ?? [],
    },
  });
}
