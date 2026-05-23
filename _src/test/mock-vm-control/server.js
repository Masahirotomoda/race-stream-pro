#!/usr/bin/env node
/**
 * mock-vm-control/server.js
 * GCP Compute API を叩かないローカルテスト用モックサーバー
 * Port: 8081
 *
 * 使い方:
 *   node _src/test/mock-vm-control/server.js
 *
 * 環境変数:
 *   PORT=8081          (デフォルト)
 *   MOCK_DELAY_MS=500  (擬似遅延 ms)
 *   MOCK_FAIL_RATE=0   (0.0〜1.0 でエラー率を設定)
 */

import http from "node:http";

const PORT = parseInt(process.env.PORT ?? "8081", 10);
const MOCK_DELAY_MS = parseInt(process.env.MOCK_DELAY_MS ?? "500", 10);
const MOCK_FAIL_RATE = parseFloat(process.env.MOCK_FAIL_RATE ?? "0");

/** インメモリ VM 管理マップ: reservation_id → vm情報 */
const vmStore = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function maybeError() {
  if (MOCK_FAIL_RATE > 0 && Math.random() < MOCK_FAIL_RATE) {
    return true;
  }
  return false;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sendJSON(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

async function handleProvision(req, res) {
  const body = await readBody(req);
  const { reservation_id } = body;

  if (!reservation_id) {
    return sendJSON(res, 400, { error: "reservation_id is required" });
  }

  await sleep(MOCK_DELAY_MS);

  if (maybeError()) {
    return sendJSON(res, 500, { error: "Mock: GCP API error (simulated)" });
  }

  const vmName = `obs-mock-${reservation_id.slice(0, 8)}`;
  const rdpHost = "10.0.0.100";
  const rdpPort = 3389;

  vmStore.set(reservation_id, {
    vm_name: vmName,
    rdp_host: rdpHost,
    rdp_port: rdpPort,
    status: "RUNNING",
    provisioned_at: new Date().toISOString(),
  });

  console.log(`[provision] ✅ ${vmName} created for reservation ${reservation_id}`);

  return sendJSON(res, 200, {
    vm_name: vmName,
    rdp_host: rdpHost,
    rdp_port: rdpPort,
    status: "RUNNING",
  });
}

async function handleDeprovision(req, res) {
  const body = await readBody(req);
  const { reservation_id } = body;

  if (!reservation_id) {
    return sendJSON(res, 400, { error: "reservation_id is required" });
  }

  await sleep(MOCK_DELAY_MS);

  if (maybeError()) {
    return sendJSON(res, 500, { error: "Mock: GCP delete error (simulated)" });
  }

  const vm = vmStore.get(reservation_id);
  if (!vm) {
    // 既に削除済みでも 200 を返す（冪等性）
    console.log(`[deprovision] ⚠️  No VM found for ${reservation_id} (already deleted?)`);
    return sendJSON(res, 200, { message: "VM not found (already deleted or never provisioned)" });
  }

  vmStore.delete(reservation_id);
  console.log(`[deprovision] ✅ ${vm.vm_name} deleted for reservation ${reservation_id}`);

  return sendJSON(res, 200, { message: "VM deleted", vm_name: vm.vm_name });
}

function handleHealthz(_req, res) {
  sendJSON(res, 200, { status: "ok", vms: vmStore.size });
}

function handleMockVms(_req, res) {
  const vms = Object.fromEntries(vmStore.entries());
  sendJSON(res, 200, { vms });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  try {
    if (req.method === "POST" && url.pathname === "/provision") {
      return await handleProvision(req, res);
    }
    if (req.method === "POST" && url.pathname === "/deprovision") {
      return await handleDeprovision(req, res);
    }
    if (req.method === "GET" && url.pathname === "/healthz") {
      return handleHealthz(req, res);
    }
    if (req.method === "GET" && url.pathname === "/mock/vms") {
      return handleMockVms(req, res);
    }

    sendJSON(res, 404, { error: "Not found", path: url.pathname });
  } catch (err) {
    console.error("[error]", err);
    sendJSON(res, 500, { error: String(err) });
  }
});

server.listen(PORT, () => {
  console.log(`
┌─────────────────────────────────────────────────┐
│  Mock VM Control Server                         │
│  http://localhost:${PORT}                          │
│                                                 │
│  Endpoints:                                     │
│    POST /provision     → VM起動（モック）         │
│    POST /deprovision   → VM削除（モック）         │
│    GET  /healthz       → ヘルスチェック           │
│    GET  /mock/vms      → 現在のVM一覧             │
│                                                 │
│  Settings:                                      │
│    MOCK_DELAY_MS = ${MOCK_DELAY_MS}ms                        │
│    MOCK_FAIL_RATE = ${MOCK_FAIL_RATE}                          │
└─────────────────────────────────────────────────┘
`);
});
