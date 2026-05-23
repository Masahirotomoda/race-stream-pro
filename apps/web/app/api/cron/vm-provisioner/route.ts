import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/app/lib/supabase/admin-client";

const VM_CONTROL_URL = process.env.VM_CONTROL_URL ?? "";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

/**
 * GET /api/cron/vm-provisioner
 * Cloud Scheduler から 5 分ごとに呼び出される
 * queued/pending 状態のジョブを処理する
 */
export async function GET(req: NextRequest) {
  // 認証チェック
  const authHeader = req.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!VM_CONTROL_URL) {
    return NextResponse.json({ error: "VM_CONTROL_URL not configured" }, { status: 500 });
  }

  const supabase = createAdminClient();

  // queued または pending のジョブを取得（古いものから順に最大5件）
  const { data: jobs, error: jobsErr } = await supabase
    .from("provisioning_jobs")
    .select(
      "id, reservation_id, action, status, attempts, last_error, locked_at, locked_by"
    )
    .in("status", ["queued", "pending"])
    .order("created_at", { ascending: true })
    .limit(5);

  if (jobsErr) {
    console.error("[cron/vm-provisioner] Failed to fetch jobs:", jobsErr);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ processed: 0, message: "No pending jobs" });
  }

  const results: Array<{
    job_id: string;
    action: string;
    status: "succeeded" | "error";
    error?: string;
  }> = [];

  for (const job of jobs) {
    const workerId = `cron-${Date.now()}`;

    // ジョブをロック（pending 状態に移行）
    const { error: lockErr } = await supabase
      .from("provisioning_jobs")
      .update({
        status: "pending",
        locked_at: new Date().toISOString(),
        locked_by: workerId,
        attempts: (job.attempts ?? 0) + 1,
      })
      .eq("id", job.id)
      .eq("status", job.status); // 楽観的ロック

    if (lockErr) {
      // 他のワーカーに取られた可能性
      console.warn(`[cron] Job ${job.id} lock failed, skipping`);
      continue;
    }

    // 予約の GCP インスタンス情報を取得
    const { data: reservation } = await supabase
      .from("reservations")
      .select("gcp_instance_name, gcp_instance_zone")
      .eq("id", job.reservation_id)
      .single();

    try {
      if (job.action === "provision") {
        // VM 起動リクエスト
        const vmRes = await fetch(`${VM_CONTROL_URL}/provision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reservation_id: job.reservation_id }),
        });

        if (!vmRes.ok) {
          throw new Error(`VM control API error: ${vmRes.status} ${await vmRes.text()}`);
        }

        const vmResult = await vmRes.json() as {
          vm_name?: string;
          rdp_host?: string;
          ip?: string;
          rdp_port?: number;
        };

        const rdpHost = vmResult?.rdp_host ?? vmResult?.ip ?? "";
        const rdpPort = vmResult?.rdp_port ?? 3389;
        const vmName = vmResult?.vm_name ?? "";

        // reservation_resources に RDP 接続情報を upsert
        await supabase.from("reservation_resources").upsert(
          {
            reservation_id: job.reservation_id,
            kind: "windows_obs",
            data: {
              rdp_host: rdpHost,
              rdp_port: rdpPort,
              username: "obsadmin",
              password: process.env.OBS_VM_DEFAULT_PASSWORD ?? "",
            },
          },
          { onConflict: "reservation_id,kind" }
        );

        // reservations の gcp_instance_name を更新
        if (vmName) {
          await supabase
            .from("reservations")
            .update({
              gcp_instance_name: vmName,
              provision_status: "provisioned",
            })
            .eq("id", job.reservation_id);
        }

        // ジョブを succeeded に更新
        await supabase
          .from("provisioning_jobs")
          .update({ status: "succeeded", locked_by: null })
          .eq("id", job.id);

        results.push({ job_id: job.id, action: "provision", status: "succeeded" });
        console.log(`[cron] ✅ Provisioned VM for reservation ${job.reservation_id}`);
      } else if (job.action === "deprovision") {
        // VM 削除リクエスト
        const vmRes = await fetch(`${VM_CONTROL_URL}/deprovision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reservation_id: job.reservation_id,
            vm_name: reservation?.gcp_instance_name ?? "",
            zone: reservation?.gcp_instance_zone ?? "",
          }),
        });

        if (!vmRes.ok) {
          throw new Error(`VM control API error: ${vmRes.status} ${await vmRes.text()}`);
        }

        // reservation_resources から windows_obs リソースを削除
        await supabase
          .from("reservation_resources")
          .delete()
          .eq("reservation_id", job.reservation_id)
          .eq("kind", "windows_obs");

        // reservations の gcp_instance_name をクリア
        await supabase
          .from("reservations")
          .update({
            gcp_instance_name: null,
            provision_status: "deprovisioned",
          })
          .eq("id", job.reservation_id);

        // ジョブを succeeded に更新
        await supabase
          .from("provisioning_jobs")
          .update({ status: "succeeded", locked_by: null })
          .eq("id", job.id);

        results.push({ job_id: job.id, action: "deprovision", status: "succeeded" });
        console.log(`[cron] ✅ Deprovisioned VM for reservation ${job.reservation_id}`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[cron] ❌ Job ${job.id} failed:`, errMsg);

      await supabase
        .from("provisioning_jobs")
        .update({
          status: "error",
          last_error: errMsg,
          locked_by: null,
        })
        .eq("id", job.id);

      results.push({ job_id: job.id, action: job.action, status: "error", error: errMsg });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
