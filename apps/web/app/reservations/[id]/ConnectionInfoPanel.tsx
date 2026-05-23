"use client";

import { useEffect, useState, useCallback } from "react";

interface SrtData {
  host?: string;
  port?: number;
  stream_key?: string;
}

interface WinData {
  rdp_host?: string;
  rdp_port?: number;
  username?: string;
  password?: string;
}

interface ProvisionStatusResponse {
  provision_status: string | null;
  plan_key: string;
  job_status: string | null;
  job_error: string | null;
  job_attempts: number;
  rdp_host: string | null;
  rdp_port: number | null;
  username: string | null;
}

interface Props {
  reservationId: string;
  srt: SrtData | null;
  win: WinData | null;
  provisionStatus: string | null;
  planKey: string;
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="ml-2 px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
    >
      {copied ? "✅ コピー済" : label ?? "コピー"}
    </button>
  );
}

function RdpInstructions({
  rdpHost,
  rdpPort,
  username,
}: {
  rdpHost: string;
  rdpPort: number;
  username: string;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-3">RDP 接続情報</h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center">
            <span className="w-32 text-gray-600">ホスト</span>
            <code className="font-mono bg-white px-2 py-1 rounded border">
              {rdpHost}:{rdpPort}
            </code>
            <CopyButton text={`${rdpHost}:${rdpPort}`} label="コピー" />
          </div>
          <div className="flex items-center">
            <span className="w-32 text-gray-600">ユーザー名</span>
            <code className="font-mono bg-white px-2 py-1 rounded border">{username}</code>
            <CopyButton text={username} />
          </div>
          <div className="flex items-center">
            <span className="w-32 text-gray-600">パスワード</span>
            <span className="text-gray-500 text-xs">
              ※ 予約確認メールに記載されています
            </span>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="font-medium text-gray-700 mb-2 text-sm">接続手順</h4>
        <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
          <li>Windows の「スタート」→「リモートデスクトップ接続」を開く</li>
          <li>
            コンピューター欄に{" "}
            <code className="font-mono bg-white px-1 rounded">
              {rdpHost}:{rdpPort}
            </code>{" "}
            を入力
          </li>
          <li>「接続」をクリックし、ユーザー名とパスワードを入力</li>
          <li>証明書の警告が出た場合は「はい」をクリック</li>
        </ol>
      </div>
    </div>
  );
}

function PollingStatus({
  jobStatus,
  jobError,
  jobAttempts,
}: {
  jobStatus: string | null;
  jobError: string | null;
  jobAttempts: number;
}) {
  if (jobStatus === "succeeded") return null;

  const statusMap: Record<string, { icon: string; text: string; color: string }> = {
    queued: { icon: "⏳", text: "VM の起動準備中...", color: "text-yellow-700" },
    running: { icon: "🔄", text: "VM を起動しています...", color: "text-blue-700" },
    error: { icon: "❌", text: "VM の起動に失敗しました", color: "text-red-700" },
  };

  const info = jobStatus ? statusMap[jobStatus] : null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
      {info ? (
        <>
          <p className={`font-medium ${info.color}`}>
            {info.icon} {info.text}
          </p>
          {jobAttempts > 0 && (
            <p className="text-xs text-gray-500 mt-1">試行回数: {jobAttempts}</p>
          )}
          {jobError && (
            <p className="text-xs text-red-600 mt-1">エラー: {jobError}</p>
          )}
          {jobStatus !== "failed" && (
            <p className="text-xs text-gray-500 mt-2">
              自動的に更新されます（15 秒ごと）
            </p>
          )}
        </>
      ) : (
        <p className="text-gray-600 text-sm">⏳ VM の状態を確認中...</p>
      )}
    </div>
  );
}

export default function ConnectionInfoPanel({
  reservationId,
  srt,
  win,
  provisionStatus,
  planKey,
}: Props) {
  const isObsPlan = planKey === "windows_obs";

  const [polledStatus, setPolledStatus] = useState<ProvisionStatusResponse | null>(null);
  const [pollingError, setPollingError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    if (!isObsPlan) return;

    try {
      const res = await fetch(`/api/reservations/${reservationId}/provision-status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ProvisionStatusResponse = await res.json();
      setPolledStatus(data);
      setPollingError(null);
    } catch (e) {
      setPollingError(e instanceof Error ? e.message : "取得エラー");
    }
  }, [reservationId, isObsPlan]);

  useEffect(() => {
    if (!isObsPlan) return;
    poll();
    const id = setInterval(poll, 15_000);
    return () => clearInterval(id);
  }, [poll, isObsPlan]);

  // RDP 接続情報（ポーリング結果またはサーバーコンポーネントから渡された初期値）
  const rdpHost = polledStatus?.rdp_host ?? win?.rdp_host ?? null;
  const rdpPort = polledStatus?.rdp_port ?? win?.rdp_port ?? 3389;
  const username = polledStatus?.username ?? win?.username ?? "obsadmin";
  const currentProvisionStatus = polledStatus?.provision_status ?? provisionStatus;
  const jobStatus = polledStatus?.job_status ?? null;
  const jobError = polledStatus?.job_error ?? null;
  const jobAttempts = polledStatus?.job_attempts ?? 0;

  return (
    <div className="space-y-6">
      {/* SRT 接続情報（OBS 以外のプランも表示） */}
      {srt && (
        <section>
          <h2 className="text-xl font-bold text-gray-800 mb-4">SRT 接続情報</h2>
          <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex items-center">
              <span className="w-32 text-gray-600">ホスト</span>
              <code className="font-mono">{srt.host}</code>
              {srt.host && <CopyButton text={srt.host} />}
            </div>
            <div className="flex items-center">
              <span className="w-32 text-gray-600">ポート</span>
              <code className="font-mono">{srt.port}</code>
            </div>
            {srt.stream_key && (
              <div className="flex items-center">
                <span className="w-32 text-gray-600">ストリームキー</span>
                <code className="font-mono text-xs bg-white px-2 py-1 rounded border">
                  {srt.stream_key}
                </code>
                <CopyButton text={srt.stream_key} />
              </div>
            )}
          </div>
        </section>
      )}

      {/* Windows OBS VM 接続情報 */}
      {isObsPlan && (
        <section>
          <h2 className="text-xl font-bold text-gray-800 mb-4">Windows OBS VM 接続情報</h2>

          {pollingError && (
            <p className="text-red-500 text-sm mb-3">⚠️ 状態取得エラー: {pollingError}</p>
          )}

          {/* VM が準備できていない場合 */}
          {(!rdpHost ||
            currentProvisionStatus === "provisioning" ||
            currentProvisionStatus === null) &&
            jobStatus !== null && (
              <PollingStatus
                jobStatus={jobStatus}
                jobError={jobError}
                jobAttempts={jobAttempts}
              />
            )}

          {/* VM 準備完了 → RDP 接続情報を表示 */}
          {rdpHost && currentProvisionStatus === "provisioned" && (
            <RdpInstructions
              rdpHost={rdpHost}
              rdpPort={rdpPort}
              username={username}
            />
          )}

          {/* 予約済みだが VM がまだ割り当てられていない */}
          {!rdpHost &&
            currentProvisionStatus !== "provisioned" &&
            jobStatus === null && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-gray-600 text-sm">
                  ⏳ VM はまだ割り当てられていません。予約開始時刻に自動的に起動されます。
                </p>
              </div>
            )}

          {/* デプロビジョン済み */}
          {currentProvisionStatus === "deprovisioned" && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-gray-600 text-sm">
                ✅ 予約終了につき VM は削除されました。
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
