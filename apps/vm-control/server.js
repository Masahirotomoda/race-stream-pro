import http from "node:http";
import { DateTime } from "luxon";
import { createClient } from "@supabase/supabase-js";

function env(k, required = true) {
  const v = process.env[k];
  if (required && !v) throw new Error(`Missing env: ${k}`);
  return v ?? "";
}

const PORT            = process.env.PORT || 8080;
const TZ              = "Asia/Tokyo";
const PROJECT_ID      = env("GCP_PROJECT_ID");
const ZONE            = env("GCE_ZONE");
const GOLDEN_INSTANCE = env("GCE_INSTANCE_NAME");
const MACHINE_TYPE    = env("GCE_MACHINE_TYPE", false) || "n1-standard-4";
const SUPABASE_URL    = env("SUPABASE_URL", false);
const SUPABASE_KEY    = env("SUPABASE_SERVICE_ROLE_KEY", false);

function json(res, code, body) {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body, null, 2));
}
async function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", c => (data += c));
    req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch { resolve({}); } });
  });
}

async function getAccessToken() {
  const res = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    { headers: { "Metadata-Flavor": "Google" } }
  );
  const { access_token } = await res.json();
  return access_token;
}
async function computeRequest(path, method = "GET", body = null) {
  const token = await getAccessToken();
  const url = `https://compute.googleapis.com/compute/v1${path}`;
  const opts = { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) { const text = await res.text(); throw new Error(`Compute API ${method} ${path} → ${res.status}: ${text}`); }
  if (res.status === 204) return null;
  return res.json();
}

const instancePath = (inst, z = ZONE) => `/projects/${PROJECT_ID}/zones/${z}/instances/${inst}`;
async function getInstance(name, zone = ZONE) { return computeRequest(instancePath(name, zone)); }
async function getInstanceStatus(name = GOLDEN_INSTANCE, zone = ZONE) { const d = await getInstance(name, zone); return d.status; }
async function startInstance(name = GOLDEN_INSTANCE, zone = ZONE) { return computeRequest(`${instancePath(name, zone)}/start`, "POST"); }
async function stopInstance(name = GOLDEN_INSTANCE, zone = ZONE) { return computeRequest(`${instancePath(name, zone)}/stop`, "POST"); }

async function waitForZoneOp(opName, timeoutMs = 300000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const op = await computeRequest(`/projects/${PROJECT_ID}/zones/${ZONE}/operations/${opName}`);
    if (op.status === "DONE") { if (op.error) throw new Error(JSON.stringify(op.error)); return op; }
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error(`Operation ${opName} timed out`);
}
async function waitForGlobalOp(opName, timeoutMs = 300000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const op = await computeRequest(`/projects/${PROJECT_ID}/global/operations/${opName}`);
    if (op.status === "DONE") { if (op.error) throw new Error(JSON.stringify(op.error)); return op; }
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error(`Global operation ${opName} timed out`);
}

async function createSnapshot(snapshotName) {
  console.log(`[snapshot] creating ${snapshotName}`);
  const vm = await getInstance(GOLDEN_INSTANCE);
  const bootDiskName = vm.disks.find(d => d.boot)?.source?.split("/").pop();
  if (!bootDiskName) throw new Error("Golden VM boot disk not found");
  const op = await computeRequest(
    `/projects/${PROJECT_ID}/zones/${ZONE}/disks/${bootDiskName}/createSnapshot`, "POST",
    { name: snapshotName, description: `RSP rental snapshot from ${GOLDEN_INSTANCE}`, labels: { source: "rsp-rental" } }
  );
  await waitForZoneOp(op.name);
  console.log(`[snapshot] done: ${snapshotName}`);
}
async function createDiskFromSnapshot(diskName, snapshotName) {
  console.log(`[disk] creating ${diskName}`);
  const op = await computeRequest(`/projects/${PROJECT_ID}/zones/${ZONE}/disks`, "POST", {
    name: diskName,
    sourceSnapshot: `projects/${PROJECT_ID}/global/snapshots/${snapshotName}`,
    type: `zones/${ZONE}/diskTypes/pd-balanced`,
    labels: { source: "rsp-rental" },
  });
  await waitForZoneOp(op.name);
  console.log(`[disk] done: ${diskName}`);
}
async function createVmFromDisk(vmName, diskName) {
  console.log(`[vm] creating ${vmName}`);
  const op = await computeRequest(`/projects/${PROJECT_ID}/zones/${ZONE}/instances`, "POST", {
    name: vmName,
    machineType: `zones/${ZONE}/machineTypes/${MACHINE_TYPE}`,
    disks: [{ boot: true, autoDelete: false, source: `projects/${PROJECT_ID}/zones/${ZONE}/disks/${diskName}` }],
    networkInterfaces: [{ subnetwork: `regions/asia-northeast1/subnetworks/default`, accessConfigs: [{ type: "ONE_TO_ONE_NAT", name: "External NAT" }] }],
    labels: { source: "rsp-rental" },
    tags: { items: ["obs-server", "rdp-access"] },
    serviceAccounts: [{ email: "default", scopes: ["https://www.googleapis.com/auth/cloud-platform"] }],
  });
  await waitForZoneOp(op.name);
  const vm = await getInstance(vmName);
  const ip = vm.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP ?? null;
  console.log(`[vm] done: ${vmName} ip=${ip}`);
  return { vmName, ip };
}
async function deleteVm(vmName) {
  console.log(`[deprovision] deleting VM ${vmName}`);
  try { const op = await computeRequest(instancePath(vmName), "DELETE"); if (op) await waitForZoneOp(op.name); }
  catch (e) { if (!e.message.includes("404")) throw e; console.log(`[deprovision] VM ${vmName} already gone`); }
}
async function deleteDisk(diskName) {
  console.log(`[deprovision] deleting disk ${diskName}`);
  try { const op = await computeRequest(`/projects/${PROJECT_ID}/zones/${ZONE}/disks/${diskName}`, "DELETE"); if (op) await waitForZoneOp(op.name); }
  catch (e) { if (!e.message.includes("404")) throw e; }
}
async function deleteSnapshot(snapshotName) {
  console.log(`[deprovision] deleting snapshot ${snapshotName}`);
  try { const op = await computeRequest(`/projects/${PROJECT_ID}/global/snapshots/${snapshotName}`, "DELETE"); if (op) await waitForGlobalOp(op.name); }
  catch (e) { if (!e.message.includes("404")) throw e; }
}

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
}
async function updateReservation(id, patch) {
  const sb = getSupabase(); if (!sb) return;
  const { error } = await sb.from("reservations").update(patch).eq("id", id);
  if (error) console.error("[supabase] update error:", error);
}
async function shouldRunByReservations(nowJst) {
  const sb = getSupabase();
  if (!sb) return { shouldRun: false, reason: "supabase_not_configured" };
  const startUpper = nowJst.plus({ minutes: 5 }).toISO();
  const endLower   = nowJst.minus({ minutes: 1 }).toISO();
  const { data, error } = await sb.from("reservations")
    .select("id,start_at,end_at,status,plan_key,provision_status")
    .eq("status", "confirmed").is("provision_status", null)
    .lte("start_at", startUpper).gte("end_at", endLower)
    .order("start_at", { ascending: true }).limit(1);
  if (error) return { shouldRun: false, reason: "supabase_error", error };
  return { shouldRun: (data?.length ?? 0) > 0, reservation: data?.[0] ?? null };
}

function resourceNames(reservationId) {
  const short = String(reservationId).replace(/-/g, "").slice(0, 8).toLowerCase();
  return { vmName: `obs-rental-${short}`, diskName: `obs-rental-disk-${short}`, snapshotName: `obs-rental-snap-${short}` };
}

process.on("uncaughtException",  e => console.error("[uncaughtException]",  e));
process.on("unhandledRejection", e => console.error("[unhandledRejection]", e));
console.log("[boot]", { PROJECT_ID, ZONE, GOLDEN_INSTANCE, MACHINE_TYPE, supabase: !!SUPABASE_URL });

http.createServer(async (req, res) => {
  const { method, url } = req;
  console.log(`[req] ${method} ${url}`);
  try {
    if (url === "/healthz") return json(res, 200, { ok: true });

    if (method === "GET" && url === "/status") {
      const status = await getInstanceStatus();
      return json(res, 200, { ok: true, status, instance: GOLDEN_INSTANCE });
    }
    if (method === "POST" && url === "/start") {
      const before = await getInstanceStatus();
      if (before === "RUNNING") return json(res, 200, { ok: true, action: "noop", status: before });
      await startInstance(); return json(res, 200, { ok: true, action: "start", statusBefore: before });
    }
    if (method === "POST" && url === "/stop") {
      const before = await getInstanceStatus();
      if (before !== "RUNNING") return json(res, 200, { ok: true, action: "noop", status: before });
      await stopInstance(); return json(res, 200, { ok: true, action: "stop", statusBefore: before });
    }
    if (method === "POST" && url === "/tick") {
      const nowJst = DateTime.now().setZone(TZ);
      const desired = await shouldRunByReservations(nowJst);
      const statusBefore = await getInstanceStatus();
      let action = "noop";
      if (desired.shouldRun && statusBefore !== "RUNNING") { await startInstance(); action = "start"; }
      else if (!desired.shouldRun && statusBefore === "RUNNING") { await stopInstance(); action = "stop"; }
      return json(res, 200, { ok: true, nowJst: nowJst.toISO(), desired, statusBefore, action });
    }

    if (method === "POST" && url === "/provision") {
      const { reservation_id } = await readBody(req);
      if (!reservation_id) return json(res, 400, { ok: false, error: "reservation_id required" });
      const { vmName, diskName, snapshotName } = resourceNames(reservation_id);
      try {
        const existing = await getInstance(vmName);
        if (existing) return json(res, 200, { ok: true, action: "already_exists", vmName, status: existing.status, ip: existing.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP ?? null });
      } catch (e) { if (!e.message.includes("404")) throw e; }
      await updateReservation(reservation_id, { provision_status: "provisioning", provisioned_vm_name: vmName, provisioned_vm_zone: ZONE, provisioned_at: new Date().toISOString() });
      try {
        await createSnapshot(snapshotName);
        await createDiskFromSnapshot(diskName, snapshotName);
        const { ip } = await createVmFromDisk(vmName, diskName);
        await updateReservation(reservation_id, { provision_status: "running" });
        return json(res, 200, { ok: true, action: "provisioned", vmName, diskName, snapshotName, ip });
      } catch (provErr) {
        await updateReservation(reservation_id, { provision_status: "error" });
        throw provErr;
      }
    }

    if (method === "POST" && url === "/deprovision") {
      const { reservation_id } = await readBody(req);
      if (!reservation_id) return json(res, 400, { ok: false, error: "reservation_id required" });
      const { vmName, diskName, snapshotName } = resourceNames(reservation_id);
      await updateReservation(reservation_id, { provision_status: "stopping" });
      await deleteVm(vmName);
      await deleteDisk(diskName);
      await deleteSnapshot(snapshotName);
      await updateReservation(reservation_id, { provision_status: "deleted", deprovisioned_at: new Date().toISOString() });
      return json(res, 200, { ok: true, action: "deprovisioned", vmName, diskName, snapshotName });
    }

    return json(res, 404, { ok: false, message: "not_found" });
  } catch (e) {
    console.error("[error]", e);
    return json(res, 500, { ok: false, error: String(e?.message || e) });
  }
}).listen(Number(PORT), "0.0.0.0", () => { console.log(`[listening] ${PORT}`); });
