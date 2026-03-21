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
    return; // keep existing
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

async function upsertWindowsObs({ reservationId }) {
  const short = reservationId.slice(0, 8);
  const windowsData = {
    rdp_host: `win-obs-${short}.example.internal`,
    rdp_port: 3389,
    username: "obs",
    password: randPass(12),
    note: "※ 現在はダミー払い出しです（後で実VMへ置換）",
  };

  const { error } = await supabase
    .from("reservation_resources")
    .upsert(
      { reservation_id: reservationId, kind: "windows_obs", data: windowsData },
      { onConflict: "reservation_id,kind" }
    );

  if (error) throw error;
}

async function deleteWindowsObs({ reservationId }) {
  await supabase
    .from("reservation_resources")
    .delete()
    .eq("reservation_id", reservationId)
    .eq("kind", "windows_obs");
}

async function writeResources(reservationId, planKey) {
  // SRT(items) は API が予約作成時に発行する前提。
  // workerは windows_obs のみを管理し、既存SRTを削除しない。

  if (planKey === "srt_obs") {
    const short = reservationId.slice(0, 8);
    const windowsData = {
      rdp_host: `win-obs-${short}.example.internal`,
      rdp_port: 3389,
      username: "obs",
      password: randPass(12),
      note: "※ 現在はダミー払い出しです（後で実VMへ置換）",
    };

    const { error: winErr } = await supabase
      .from("reservation_resources")
      .upsert(
        { reservation_id: reservationId, kind: "windows_obs", data: windowsData },
        { onConflict: "reservation_id,kind" }
      );
    if (winErr) throw winErr;
  } else {
    // OBSプラン以外なら windows_obs は消す（SRTは触らない）
    await supabase
      .from("reservation_resources")
      .delete()
      .eq("reservation_id", reservationId)
      .eq("kind", "windows_obs");
  }
}

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
        await writeResources({
          reservationId,
          planKey: r.plan_key,
          cameraCount: r.camera_count ?? 1,
        });
        await setReservationProvisionStatus(reservationId, "ready");
      }
    } else if (job.action === "deprovision") {
      await setReservationProvisionStatus(reservationId, "running");
      // SRTは保持（サーバ常時稼働の想定）。Windowsだけ返却。
      await deleteWindowsObs({ reservationId });
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
  console.log("[worker] boot", { lockedBy, SRT_PUBLIC_HOST, SRT_PUBLIC_PORT });

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
