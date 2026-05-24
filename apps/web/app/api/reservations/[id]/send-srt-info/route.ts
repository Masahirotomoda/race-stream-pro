import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/app/lib/supabase/admin-client";

// メール送信ユーティリティを再利用
async function sendSrtInfoEmail(to: string, payload: {
  reservationId: string;
  startAt:       string;
  endAt:         string;
  host:          string;
  port:          number;
  items:         Array<{ streamid: string; passphrase: string }>;
}) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
  const FROM_EMAIL     = process.env.FROM_EMAIL ?? "noreply@beql.jp";

  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

  const camRows = payload.items.map((item, idx) => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #2e2e40;color:#aaa;">Camera ${idx + 1}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #2e2e40;">
        <div style="font-family:monospace;font-size:13px;color:#a8d8ea;word-break:break-all;">
          publish:${item.streamid}:rsp:${item.passphrase}
        </div>
      </td>
    </tr>
  `).join("");

  const startJst = new Date(payload.startAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  const endJst   = new Date(payload.endAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

  const html = `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><title>SRT接続情報</title></head>
<body style="background:#0f0f13;color:#e8e8f0;font-family:'Noto Sans JP',sans-serif;margin:0;padding:0;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">

    <div style="text-align:center;margin-bottom:28px;">
      <div style="display:inline-block;background:#e63946;border-radius:8px;padding:8px 16px;font-size:18px;font-weight:700;color:#fff;">
        🏎 RaceStreamPro
      </div>
      <h1 style="font-size:22px;font-weight:700;margin:16px 0 4px;">SRT 接続情報</h1>
      <p style="color:#888;font-size:14px;margin:0;">この情報を使用してカメラを接続してください</p>
    </div>

    <!-- 予約情報 -->
    <div style="background:#1a1a24;border:1px solid #2e2e40;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">予約情報</div>
      <div style="display:grid;gap:6px;font-size:13px;">
        <div><span style="color:#888;margin-right:8px;">予約ID</span><span style="font-family:monospace;color:#60a5fa;">${payload.reservationId.slice(0, 8)}</span></div>
        <div><span style="color:#888;margin-right:8px;">開始</span>${startJst}</div>
        <div><span style="color:#888;margin-right:8px;">終了</span>${endJst}</div>
      </div>
    </div>

    <!-- 共通情報 -->
    <div style="background:#1a1a24;border:1px solid #2e2e40;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">共通接続情報</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr>
          <td style="padding:6px 0;color:#888;width:120px;">サーバーホスト</td>
          <td style="font-family:monospace;font-weight:700;">${payload.host}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#888;">ポート</td>
          <td style="font-family:monospace;font-weight:700;">${payload.port}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#888;">SRT Mode</td>
          <td style="font-family:monospace;font-weight:700;">Caller</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#888;">推奨 Latency</td>
          <td style="font-family:monospace;font-weight:700;">200 ms</td>
        </tr>
      </table>
    </div>

    <!-- カメラ別 Stream ID -->
    <div style="background:#1a1a24;border:1px solid #2e2e40;border-radius:10px;overflow:hidden;margin-bottom:20px;">
      <div style="padding:14px 20px;border-bottom:1px solid #2e2e40;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.08em;">
        カメラ別 Stream ID（Larix / LM-Cam に入力）
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#0f0f18;">
            <th style="padding:10px 14px;text-align:left;color:#888;font-weight:600;">カメラ</th>
            <th style="padding:10px 14px;text-align:left;color:#888;font-weight:600;">Stream ID</th>
          </tr>
        </thead>
        <tbody>${camRows}</tbody>
      </table>
    </div>

    <!-- 設定手順リンク -->
    <div style="background:rgba(69,123,157,0.1);border:1px solid rgba(69,123,157,0.25);border-radius:10px;padding:14px 18px;margin-bottom:24px;">
      <div style="font-size:13px;line-height:1.8;">
        📱 <strong>Larix Broadcaster</strong>（推奨）または <strong>LM-Cam</strong> を使用してください。<br>
        設定手順: <a href="https://rsp.beql.jp" style="color:#4895ef;">rsp.beql.jp</a> の設定書ページをご参照ください。
      </div>
    </div>

    <div style="text-align:center;font-size:12px;color:#555;border-top:1px solid #2e2e40;padding-top:16px;">
      © RaceStreamPro — この情報は第三者に共有しないでください
    </div>
  </div>
</body>
</html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      from:    FROM_EMAIL,
      to:      [to],
      subject: `【RaceStreamPro】SRT接続情報 - ${startJst}`,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error: ${err}`);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 認証チェック
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cs: any[]) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 予約を取得（本人確認）
  const admin = createAdminClient();
  const { data: reservation } = await admin
    .from("reservations")
    .select("id, user_id, start_at, end_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!reservation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // SRT リソースを取得
  const { data: resource } = await admin
    .from("reservation_resources")
    .select("data")
    .eq("reservation_id", id)
    .eq("kind", "srt")
    .single();

  if (!resource?.data) return NextResponse.json({ error: "SRT info not found" }, { status: 404 });

  const srtData = resource.data as {
    host:  string;
    port:  number;
    items: Array<{ streamid: string; passphrase: string }>;
  };

  // リクエストボディ
  const body = await req.json();
  const emails: string[] = (body.emails ?? []).filter((e: string) => e.includes("@"));

  if (emails.length === 0) {
    return NextResponse.json({ error: "No valid emails" }, { status: 400 });
  }
  if (emails.length > 20) {
    return NextResponse.json({ error: "Too many emails (max 20)" }, { status: 400 });
  }

  // 全員に送信
  const results = await Promise.allSettled(
    emails.map((email) =>
      sendSrtInfoEmail(email, {
        reservationId: reservation.id,
        startAt:       reservation.start_at,
        endAt:         reservation.end_at,
        host:          srtData.host,
        port:          srtData.port,
        items:         srtData.items ?? [],
      })
    )
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed    = results.filter((r) => r.status === "rejected").length;

  console.log(`[send-srt-info] sent=${succeeded} failed=${failed} reservation=${id}`);

  return NextResponse.json({ sent: succeeded, failed, total: emails.length });
}
