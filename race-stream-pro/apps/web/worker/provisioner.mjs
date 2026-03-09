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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randPass(len = 16) {
  return crypto.randomBytes(Math.ceil(len / 2)).toString("hex").slice(0, len);
}

function buildSrtUrl({ host, port, streamid, passphrase }) {
  // 3.B: ワンライナー srt://... で表示したい
  const q = new URLSearchParams({
    streamid,
    passphrase,
    mode: "caller",
  });
  return `srt://${host}:${port}?${q.toString()}`;
}

async function claimOneJob() {
  // queued から1件拾う
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

  // 競合回避：queued のものだけ running に遷移できるようにする
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

  if (claimErr) return null; // 他workerが先に取った等
  return claimed;
}

async function setReservationProvisionStatus(reservationId, status) {
  const { error } = await supabase
    .from("reservations")
    .update({ provision_status: status })
    .eq("id", reservationId);
  if (error) throw error;
}

async function writeResources(reservationId, planKey) {
  // 既存を消してから挿入（unique制約不要で確実）
  await supabase.from("reservation_resources").delete().eq("reservation_id", reservationId);

  // SRT resource（全プラン共通）
  const streamid = `resv_${reservationId}`;
  const passphrase = randPass(16);
  const srtUrl = buildSrtUrl({
    host: SRT_PUBLIC_HOST,
    port: SRT_PUBLIC_PORT,
    streamid,
    passphrase,
  });

  const srtData = {
    srt_url: srtUrl,
    host: SRT_PUBLIC_HOST,
    port: SRT_PUBLIC_PORT,
    streamid,
    passphrase,
  };

  const { error: srtErr } = await supabase.from("reservation_resources").insert({
    reservation_id: reservationId,
    kind: "srt",
    data: srtData,
  });
  if (srtErr) throw srtErr;

  // Windows+OBS プランのみ追加
  if (planKey === "srt_obs") {
    const short = reservationId.slice(0, 8);
    const windowsData = {
      rdp_host: `win-obs-${short}.example.internal`,
      rdp_port: 3389,
      username: "obs",
      password: randPass(12),
      note: "※ 現在はダミー払い出しです（後で実VMへ置換）",
    };

    const { error: winErr } = await supabase.from("reservation_resources").insert({
      reservation_id: reservationId,
      kind: "windows_obs",
      data: windowsData,
    });
    if (winErr) throw winErr;
  }
}

async function handleJob(job) {
  const reservationId = job.reservation_id;
  console.log("[worker] start job", { id: job.id, reservationId, action: job.action });

  try {
    if (job.action === "provision") {
      await setReservationProvisionStatus(reservationId, "running");

      const { data: r, error: rErr } = await supabase
        .from("reservations")
        .select("id, plan_key, status")
        .eq("id", reservationId)
        .single();
      if (rErr) throw rErr;

      // 確定済み以外は払い出さない（安全）
      if (r.status !== "confirmed") {
        console.log("[worker] skip provision because status != confirmed", r.status);
        await setReservationProvisionStatus(reservationId, "none");
      } else {
        await writeResources(reservationId, r.plan_key);
        await setReservationProvisionStatus(reservationId, "ready");
      }
    } else if (job.action === "deprovision") {
      await setReservationProvisionStatus(reservationId, "running");
      await supabase.from("reservation_resources").delete().eq("reservation_id", reservationId);
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

    // reservation も failed に
    try {
      await setReservationProvisionStatus(reservationId, "failed");
    } catch {}

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
