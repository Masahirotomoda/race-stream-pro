"use client";

import { useEffect, useState } from "react";

interface VmReservation {
  id: string;
  status: string;
  provision_status: string | null;
  plan_key: string;
  gcp_instance_name: string | null;
  gcp_instance_zone: string | null;
  start_at: string;
  end_at: string;
  user_id: string;
  windows_obs: {
    rdp_host?: string;
    rdp_port?: number;
  } | null;
}

interface ProvisionJob {
  id: string;
  reservation_id: string;
  action: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_BADGE: Record<string, string> = {
  queued: "bg-yellow-100 text-yellow-800",
  pending: "bg-blue-100 text-blue-800",
  succeeded: "bg-green-100 text-green-800",
  error: "bg-red-100 text-red-800",
};

const PROVISION_BADGE: Record<string, string> = {
  provisioned: "bg-green-100 text-green-800",
  provisioning: "bg-blue-100 text-blue-800",
  deprovisioned: "bg-gray-100 text-gray-600",
  error: "bg-red-100 text-red-800",
};

export default function AdminVmsPage() {
  const [reservations, setReservations] = useState<VmReservation[]>([]);
  const [jobs, setJobs] = useState<ProvisionJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [jobLoading, setJobLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchReservations() {
    try {
      const res = await fetch("/api/admin/vms");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setReservations(data.reservations ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取得エラー");
    } finally {
      setLoading(false);
    }
  }

  async function fetchJobs() {
    try {
      const res = await fetch("/api/admin/vms/jobs");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setJobs(data.jobs ?? []);
    } catch {
      // ジョブ取得失敗は軽微なエラーとして無視
    } finally {
      setJobLoading(false);
    }
  }

  useEffect(() => {
    fetchReservations();
    fetchJobs();

    const interval = setInterval(() => {
      fetchReservations();
      fetchJobs();
    }, 30_000); // 30 秒ごとに自動更新

    return () => clearInterval(interval);
  }, []);

  async function handleManualProvision(reservationId: string, action: "provision" | "deprovision") {
    const label = action === "provision" ? "プロビジョニング" : "デプロビジョニング";
    if (!confirm(`予約 ${reservationId.slice(0, 8)}... を${label}しますか？`)) return;

    try {
      const method = action === "provision" ? "POST" : "DELETE";
      const res = await fetch(`/api/admin/reservations/${reservationId}/vm-provision`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: action === "provision" ? JSON.stringify({ action }) : undefined,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      alert(`✅ ${label}ジョブをキューに追加しました`);
      fetchReservations();
      fetchJobs();
    } catch (e) {
      alert(`❌ エラー: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <main className="max-w-7xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">VM 稼働状況ダッシュボード</h1>
        <button
          onClick={() => { fetchReservations(); fetchJobs(); }}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
        >
          🔄 更新
        </button>
      </div>

      {/* 予約一覧テーブル */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-gray-700 mb-3">Windows OBS 予約一覧</h2>
        {loading ? (
          <p className="text-gray-500">読み込み中...</p>
        ) : error ? (
          <p className="text-red-500">エラー: {error}</p>
        ) : reservations.length === 0 ? (
          <p className="text-gray-500">対象予約なし</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-200 rounded-lg text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-gray-600">予約 ID</th>
                  <th className="px-4 py-3 text-left text-gray-600">予約ステータス</th>
                  <th className="px-4 py-3 text-left text-gray-600">VM ステータス</th>
                  <th className="px-4 py-3 text-left text-gray-600">GCPインスタンス</th>
                  <th className="px-4 py-3 text-left text-gray-600">RDPホスト</th>
                  <th className="px-4 py-3 text-left text-gray-600">開始</th>
                  <th className="px-4 py-3 text-left text-gray-600">終了</th>
                  <th className="px-4 py-3 text-left text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {reservations.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {r.id.slice(0, 8)}...
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-700">
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {r.provision_status ? (
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            PROVISION_BADGE[r.provision_status] ?? "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {r.provision_status}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {r.gcp_instance_name ? (
                        <span title={r.gcp_instance_zone ?? ""}>
                          {r.gcp_instance_name}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {r.windows_obs?.rdp_host ? (
                        <>
                          {r.windows_obs.rdp_host}:{r.windows_obs.rdp_port ?? 3389}
                        </>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {new Date(r.start_at).toLocaleString("ja-JP")}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {new Date(r.end_at).toLocaleString("ja-JP")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {!r.provision_status || r.provision_status === "deprovisioned" ? (
                          <button
                            onClick={() => handleManualProvision(r.id, "provision")}
                            className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                          >
                            起動
                          </button>
                        ) : (
                          <button
                            onClick={() => handleManualProvision(r.id, "deprovision")}
                            className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                          >
                            削除
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ジョブログテーブル */}
      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">プロビジョニングジョブログ</h2>
        {jobLoading ? (
          <p className="text-gray-500">読み込み中...</p>
        ) : jobs.length === 0 ? (
          <p className="text-gray-500">ジョブなし</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-200 rounded-lg text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-gray-600">ジョブ ID</th>
                  <th className="px-4 py-3 text-left text-gray-600">予約 ID</th>
                  <th className="px-4 py-3 text-left text-gray-600">アクション</th>
                  <th className="px-4 py-3 text-left text-gray-600">ステータス</th>
                  <th className="px-4 py-3 text-left text-gray-600">試行回数</th>
                  <th className="px-4 py-3 text-left text-gray-600">エラー</th>
                  <th className="px-4 py-3 text-left text-gray-600">作成日時</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {jobs.map((j) => (
                  <tr key={j.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {j.id.slice(0, 8)}...
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {j.reservation_id.slice(0, 8)}...
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className="px-2 py-1 rounded bg-purple-100 text-purple-800">
                        {j.action}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          STATUS_BADGE[j.status] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {j.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-xs">{j.attempts}</td>
                    <td className="px-4 py-3 text-xs text-red-600 max-w-xs truncate">
                      {j.last_error ?? <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {new Date(j.created_at).toLocaleString("ja-JP")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
