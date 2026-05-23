import { NextResponse } from "next/server";
import { createAdminClient } from "@/app/lib/supabase/admin-client";

/**
 * GET /api/admin/vms/jobs
 * プロビジョニングジョブのログ一覧を返す（管理者向け）
 */
export async function GET() {
  const supabase = createAdminClient();

  const { data: jobs, error } = await supabase
    .from("provisioning_jobs")
    .select(
      "id, reservation_id, action, status, attempts, last_error, created_at, updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[api/admin/vms/jobs] DB error:", error);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  return NextResponse.json({ jobs: jobs ?? [] });
}
