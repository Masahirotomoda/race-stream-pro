import crypto from "node:crypto";
import os from "node:os";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !SERVICE_ROLE) {
  console.error("[worker] missing env:", {
    NEXT_PUBLIC_SUPABASE_URL: !!URL,
    SUPABASE_SERVICE_ROLE_KEY: !!SERVICE_ROLE,
  });
  process.exit(1);
}

const supabase = createClient(URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const lockedBy = `worker:${os.hostname()}:${process.pid}`;
const SRT_PUBLIC_HOST = process.env.SRT_PUBLIC_HOST ?? "localhost";
const SRT_PUBLIC_PORT = Number(process.env.SRT_PUBLIC_PORT ?? "20000");
const SRT_MAX_IDS_PER_RESERVATION = Number(process.env.SRT_MAX_IDS_PER_RESERVATION ?? "5");

// GCP VM 作成設定（案B: テンプレートから毎回新規VM作成）
const GCP_PROJECT = process.env.GCP_PROJECT ?? "livestreaming-430703";
const VM_BOOT_POLL_INTERVAL_MS = 30_000;  // 30秒ごとにVM起動確認
const VM_BOOT_TIMEOUT_MS = 10 * 60_000;  // 最大10分でVM起動待ち
const GCP_VM_DISABLED = process.env.GCP_VM_DISABLED === "true"; // true=gcloudなし環境向け

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function clampInt(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.min(Math.max(Math.floor(x), lo), hi);
}

function randPass(len = 16) {
  return crypto.randomBytes(Math.ceil(len / 2)).toString("hex").slice(0, len);
}

function buildSrtUrl({ host, port, streamid, passphrase }) {
  const q = new URLSearchParams({ streamid, passphrase, mode: "caller" });
  return `srt://${host}:${port}?${q.toString()}`;
}

// ── Supabase ジョブ管理 ────────────────────────────────────────

async function claimOneJob() {
  const { data: jobs, error } = await supabase
    .from("provisioning_jobs")
    .select("*")
    .eq("status", "queued")
    .lte("run_at", new Date().toISOString())
    .order("run_at", { ascending: true })
    .limit(1);

  if (error) throw error;
  if (!jobs || jobs.length === 0) return null;

  const job = jobs[0];

  const { data: claimed, error: claimErr } = await supabase
    .from("provisioning_jobs")
    .update({
      status: "running",
      locked_at: new Date().toISOString(),
      locked_by: lockedBy,
      attempts: (job.attempts ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .eq("status", "queued")
    .select()
    .single();

  if (claimErr) return null;
  return claimed;
}

async function setReservationProvisionStatus(reservationId, status) {
  const { error } = await supabase
    .from("reservations")
    .update({ provision_status: status })
    .eq("id", reservationId);
  if (error) throw error;
}

// ── SRTリソース管理 ───────────────────────────────────────────

async function ensureSrtResource({ reservationId, cameraCount }) {
  const { data: existing, error: exErr } = await supabase
    .from("reservation_resources")
    .select("data")
    .eq("reservation_id", reservationId)
    .eq("kind", "srt")
    .maybeSingle();

  if (exErr) throw exErr;

  const items = existing?.data?.items;
  if (Array.isArray(items) && items.length > 0) {
    return; // 既存SRTリソースを保持
  }

  const maxN = clampInt(SRT_MAX_IDS_PER_RESERVATION, 1, 50);
  const n = clampInt(cameraCount ?? 1, 1, maxN);

  const newItems = Array.from({ length: n }, (_, i) => {
    const streamid = `resv_${reservationId}_${String(i + 1).padStart(2, "0")}`;
    const passphrase = randPass(16);
    return {
      camera_index: i + 1,
      streamid,
      passphrase,
      srt_url: buildSrtUrl({
        host: SRT_PUBLIC_HOST,
        port: SRT_PUBLIC_PORT,
        streamid,
        passphrase,
      }),
    };
  });

  const data = {
    issued_at: new Date().toISOString(),
    host: SRT_PUBLIC_HOST,
    port: SRT_PUBLIC_PORT,
    max_ids: maxN,
    camera_count: n,
    items: newItems,
  };

  const { error } = await supabase
    .from("reservation_resources")
    .upsert(
      { reservation_id: reservationId, kind: "srt", data },
      { onConflict: "reservation_id,kind" }
    );

  if (error) throw error;
}

// ── OBS VM 作成（案B: テンプレートから新規VM作成）────────────

/**
 * アクティブなVMテンプレートをDBから取得する。
 */
async function getActiveTemplate() {
  const { data, error } = await supabase
    .from("obs_vm_templates")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("利用可能なOBSテンプレートがありません（is_active=trueのレコードなし）");
  return data;
}

/**
 * gcloud CLI を使ってスナップショットから新規VMを作成する。
 * インスタンス名: obs-{reservationId の先頭8文字}-{ランダム4文字}
 */
async function createObsVm(reservationId) {
  const template = await getActiveTemplate();
  const short = reservationId.replace(/-/g, "").slice(0, 8);
  const rand  = crypto.randomBytes(2).toString("hex"); // 4文字
  const instanceName = `obs-${short}-${rand}`;
  const newPassword  = randPass(16);

  console.log(`[worker] creating OBS VM: ${instanceName} from snapshot ${template.snapshot_name}`);

  if (!GCP_VM_DISABLED) {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);

    // スナップショットからディスク＋VMを作成
    await execFileAsync("gcloud", [
      "compute", "instances", "create", instanceName,
      `--zone=${template.gcp_zone}`,
      `--project=${template.gcp_project ?? GCP_PROJECT}`,
      `--machine-type=${template.machine_type}`,
      `--source-snapshot=${template.snapshot_name}`,
      `--boot-disk-size=${template.disk_size_gb}GB`,
      "--boot-disk-type=pd-ssd",
      "--network-interface=network=default,no-address", // 内部IPのみ（外部IPなし）
      "--metadata=windows-startup-script-cmd=",         // スタートアップスクリプトクリア
      "--quiet",
      "--format=json",
    ]).catch((e) => {
      throw new Error(`VM create failed: ${e.stderr ?? e.message}`);
    });

    console.log(`[worker] VM created: ${instanceName}`);
  } else {
    console.log(`[worker] GCP_VM_DISABLED=true: skip VM creation for ${instanceName}`);
  }

  // 内部IPを取得（gcloud describe）
  let internalIp = "10.0.0.1"; // GCP_VM_DISABLED 時のダミー
  if (!GCP_VM_DISABLED) {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);

    const { stdout } = await execFileAsync("gcloud", [
      "compute", "instances", "describe", instanceName,
      `--zone=${template.gcp_zone}`,
      `--project=${template.gcp_project ?? GCP_PROJECT}`,
      "--format=get(networkInterfaces[0].networkIP)",
    ]).catch((e) => {
      throw new Error(`VM describe failed: ${e.stderr ?? e.message}`);
    });
    internalIp = stdout.trim();
    console.log(`[worker] VM internal IP: ${internalIp}`);
  }

  // obs_servers にレコードを動的登録
  const { data: obsServer, error: insertErr } = await supabase
    .from("obs_servers")
    .insert({
      name:             instanceName,
      gcp_instance:     instanceName,
      gcp_zone:         template.gcp_zone,
      gcp_project:      template.gcp_project ?? GCP_PROJECT,
      internal_ip:      internalIp,
      metrics_port:     template.metrics_port,
      secret_key:       template.secret_key,
      status:           "in_use",
      assigned_to:      reservationId,
      rdp_host:         null,   // 外部IP なし（IAP Tunnel 経由で接続）
      rdp_port:         template.rdp_port,
      rdp_username:     template.rdp_username,
      rdp_password:     newPassword,
      is_dynamic:       true,
      template_id:      template.id,
      vm_instance_name: instanceName,
      notes:            `動的VM: reservation ${reservationId}`,
    })
    .select()
    .single();

  if (insertErr) throw insertErr;

  // obs_server_assignments に履歴記録
  await supabase
    .from("obs_server_assignments")
    .insert({
      obs_server_id:  obsServer.id,
      reservation_id: reservationId,
      rdp_password:   newPassword,
      status:         "active",
    });

  // MetricsAgent 起動を待機
  if (!GCP_VM_DISABLED) {
    await waitForVmBoot(obsServer.id, internalIp, template.metrics_port, instanceName);
  } else {
    console.log(`[worker] GCP_VM_DISABLED=true: skip boot wait for ${instanceName}`);
  }

  // reservation_resources.windows_obs に接続情報を保存
  // RDPはIAP Tunnel経由: gcloud compute start-iap-tunnel instanceName rdp_port
  const windowsData = {
    rdp_host:       null,            // IAPトンネル経由のためホストなし
    rdp_port:       template.rdp_port,
    username:       template.rdp_username,
    password:       newPassword,
    server_name:    instanceName,
    server_id:      obsServer.id,
    gcp_instance:   instanceName,
    gcp_zone:       template.gcp_zone,
    gcp_project:    template.gcp_project ?? GCP_PROJECT,
    iap_tunnel_cmd: `gcloud compute start-iap-tunnel ${instanceName} ${template.rdp_port} --local-host-port=localhost:13389 --zone=${template.gcp_zone} --project=${template.gcp_project ?? GCP_PROJECT}`,
    note:           "RDP接続にはIAP Tunnelコマンドを先に実行してください",
  };

  const { error: resErr } = await supabase
    .from("reservation_resources")
    .upsert(
      { reservation_id: reservationId, kind: "windows_obs", data: windowsData },
      { onConflict: "reservation_id,kind" }
    );

  if (resErr) throw resErr;

  console.log(`[worker] OBS VM ready: ${instanceName} → reservation ${reservationId}`);
  return obsServer;
}

/**
 * MetricsAgent /health をポーリングしてVM起動完了を確認する。
 */
async function waitForVmBoot(obsServerId, internalIp, metricsPort, instanceName) {
  const healthUrl = `http://${internalIp}:${metricsPort}/health`;
  const startTime = Date.now();

  console.log(`[worker] waiting for VM boot: ${instanceName} (${healthUrl})`);

  while (Date.now() - startTime < VM_BOOT_TIMEOUT_MS) {
    await sleep(VM_BOOT_POLL_INTERVAL_MS);

    try {
      const res = await fetch(healthUrl, {
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });
      if (res.ok) {
        console.log(`[worker] VM boot confirmed: ${instanceName}`);
        return;
      }
    } catch {
      // まだ起動中
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`[worker] still booting ${instanceName}... ${elapsed}s elapsed`);
  }

  // タイムアウト: obs_servers を error に変更
  await supabase
    .from("obs_servers")
    .update({ status: "error" })
    .eq("id", obsServerId);

  throw new Error(`VM boot timeout after ${VM_BOOT_TIMEOUT_MS / 1000}s: ${instanceName}`);
}

/**
 * 予約終了時に動的VMを削除し、obs_servers レコードも削除する。
 */
async function deleteObsVm(reservationId) {
  // 割り当て中のobs_serverを取得
  const { data: server, error: sErr } = await supabase
    .from("obs_servers")
    .select("id, name, gcp_instance, gcp_zone, gcp_project, is_dynamic")
    .eq("assigned_to", reservationId)
    .maybeSingle();

  if (sErr) throw sErr;
  if (!server) {
    console.log(`[worker] no obs_server assigned to ${reservationId} - skip delete`);
    return;
  }

  console.log(`[worker] deleting OBS VM: ${server.gcp_instance}`);

  // obs_server_assignments を released に更新
  await supabase
    .from("obs_server_assignments")
    .update({ released_at: new Date().toISOString(), status: "released" })
    .eq("obs_server_id", server.id)
    .eq("reservation_id", reservationId)
    .eq("status", "active");

  // reservation_resources から windows_obs を削除（ユーザーから非表示）
  await supabase
    .from("reservation_resources")
    .delete()
    .eq("reservation_id", reservationId)
    .eq("kind", "windows_obs");

  // GCP VM を削除
  if (!GCP_VM_DISABLED && server.is_dynamic) {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);

    await execFileAsync("gcloud", [
      "compute", "instances", "delete", server.gcp_instance,
      `--zone=${server.gcp_zone}`,
      `--project=${server.gcp_project ?? GCP_PROJECT}`,
      "--delete-disks=all",
      "--quiet",
    ]).catch((e) => {
      // VM が既に存在しない場合はエラーを無視
      console.warn(`[worker] VM delete warning: ${e.stderr ?? e.message}`);
    });

    console.log(`[worker] GCP VM deleted: ${server.gcp_instance}`);
  } else {
    console.log(`[worker] GCP_VM_DISABLED=true or static VM: skip gcloud delete for ${server.gcp_instance}`);
  }

  // obs_servers レコードを削除（動的VMのみ）
  if (server.is_dynamic) {
    await supabase
      .from("obs_servers")
      .delete()
      .eq("id", server.id);
    console.log(`[worker] obs_servers record deleted: ${server.id}`);
  } else {
    // 静的VMの場合は available に戻す（後方互換）
    await supabase
      .from("obs_servers")
      .update({ status: "available", assigned_to: null })
      .eq("id", server.id);
  }

  console.log(`[worker] OBS VM cleanup complete: ${server.gcp_instance}`);
}


// ── メインジョブハンドラー ────────────────────────────────────

async function handleJob(job) {
  if (!job) return;
  const reservationId = job.reservation_id;
  console.log("[worker] start job", { id: job.id, reservationId, action: job.action });

  try {
    if (job.action === "provision") {
      await setReservationProvisionStatus(reservationId, "running");

      const { data: r, error: rErr } = await supabase
        .from("reservations")
        .select("id, plan_key, status, camera_count")
        .eq("id", reservationId)
        .single();

      if (rErr) throw rErr;

      if (r.status !== "confirmed") {
        console.log("[worker] skip provision because status != confirmed", r.status);
        await setReservationProvisionStatus(reservationId, "none");
      } else {
        // SRTリソース確保（既存があれば保持）
        await ensureSrtResource({ reservationId, cameraCount: r.camera_count ?? 1 });

        // OBSプランなら テンプレートから新規VMを作成（案B）
        if (r.plan_key === "srt_obs") {
          await createObsVm(reservationId);
        }

        await setReservationProvisionStatus(reservationId, "ready");
      }

    } else if (job.action === "deprovision") {
      await setReservationProvisionStatus(reservationId, "running");

      // OBS VM削除（案B: VMごと削除して完全クリーン）
      await deleteObsVm(reservationId);

      await setReservationProvisionStatus(reservationId, "none");

    }

    await supabase
      .from("provisioning_jobs")
      .update({
        status: "succeeded",
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    console.log("[worker] succeeded job", job.id);
  } catch (e) {
    const msg = e?.message ?? String(e);
    console.error("[worker] failed job", job.id, msg);

    try { await setReservationProvisionStatus(reservationId, "failed"); } catch {}

    await supabase
      .from("provisioning_jobs")
      .update({
        status: "failed",
        last_error: msg,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
  }
}

async function main() {
  console.log("[worker] boot", { lockedBy, SRT_PUBLIC_HOST, SRT_PUBLIC_PORT, GCP_PROJECT, GCP_VM_DISABLED });

  while (true) {
    try {
      const job = await claimOneJob();
      if (!job) {
        await sleep(1500);
        continue;
      }
      await handleJob(job);
    } catch (e) {
      console.error("[worker] loop error", e?.message ?? e);
      await sleep(2000);
    }
  }
}

main();
