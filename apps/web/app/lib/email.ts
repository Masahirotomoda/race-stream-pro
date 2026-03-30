import { Resend } from "resend";

export type ReservationEmailData = {
  name:       string;
  planName:   string;
  startAt:    string;
  endAt:      string;
  totalPrice: number;
  streamUrl?: string | null;
  obsScene?:  string | null;
  notes?:     string | null;
};

const FROM = process.env.FROM_EMAIL ?? "onboarding@resend.dev";

// ★重要：モジュールロード時に new Resend() しない（キー未設定でクラッシュするため）
let _resend: Resend | null = null;

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

// ロケール非依存の日付フォーマット
function fmtDate(iso: string): string {
  const d   = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const wd  = ["日","月","火","水","木","金","土"][d.getDay()];
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日（${wd}） ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildHtml(opts: {
  subject:     string;
  statusLabel: string;
  statusColor: string;
  statusBg:    string;
  message:     string;
  r:           ReservationEmailData;
  note?:       string;
}): string {
  const durationMin = Math.round(
    (new Date(opts.r.endAt).getTime() - new Date(opts.r.startAt).getTime()) / 60000
  );

  const rows: [string, string][] = [
    ["プラン",    opts.r.planName],
    ["開始日時",  fmtDate(opts.r.startAt)],
    ["終了日時",  fmtDate(opts.r.endAt)],
    ["放映時間",  `${durationMin} 分`],
    ["合計金額",  `¥${opts.r.totalPrice.toLocaleString()} (税込)`],
    ...(opts.r.streamUrl ? [["配信 URL",   opts.r.streamUrl]  as [string,string]] : []),
    ...(opts.r.obsScene  ? [["OBS シーン", opts.r.obsScene]   as [string,string]] : []),
    ...(opts.r.notes     ? [["メモ",       opts.r.notes]      as [string,string]] : []),
  ];

  const tableRows = rows.map(([label, value], i) => `
    <tr style="background:${i % 2 === 0 ? "#fff" : "#f9f9f9"};">
      <td style="padding:11px 16px;font-size:12px;font-weight:700;color:#888;width:110px;letter-spacing:0.05em;border-right:1px solid #eee;">${label}</td>
      <td style="padding:11px 16px;font-size:14px;color:#111;">${value}</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${opts.subject}</title></head>
<body style="margin:0;padding:0;background:#f2f2f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f2;padding:40px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
<tr><td style="background:#e63946;padding:22px 32px;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="font-size:20px;font-weight:800;color:#fff;letter-spacing:0.04em;">🏁 RACE STREAM PRO</td>
    <td align="right">
      <span style="display:inline-block;padding:4px 14px;background:${opts.statusBg};color:${opts.statusColor};border:1.5px solid ${opts.statusColor};border-radius:20px;font-size:12px;font-weight:700;">${opts.statusLabel}</span>
    </td>
  </tr></table>
</td></tr>

<tr><td style="padding:28px 32px 4px;"><h1 style="margin:0;font-size:20px;font-weight:800;color:#111;">${opts.subject}</h1></td></tr>
<tr><td style="padding:12px 32px 24px;"><p style="margin:0;font-size:14px;color:#555;line-height:1.7;">${opts.message}</p></td></tr>

<tr><td style="padding:0 32px 20px;">
  <div style="background:#fef2f2;border-left:4px solid #e63946;padding:14px 18px;border-radius:0 8px 8px 0;">
    <div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:5px;">予約名</div>
    <div style="font-size:17px;font-weight:800;color:#111;">${opts.r.name}</div>
  </div>
</td></tr>

<tr><td style="padding:0 32px 24px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e8e8;border-radius:8px;overflow:hidden;border-collapse:separate;border-spacing:0;">
    ${tableRows}
  </table>
</td></tr>

${opts.note ? `<tr><td style="padding:0 32px 24px;">
  <p style="margin:0;font-size:13px;color:#888;line-height:1.6;padding:12px 16px;background:#fafafa;border:1px solid #eee;border-radius:6px;">${opts.note}</p>
</td></tr>` : ""}

<tr><td style="background:#f7f7f7;padding:18px 32px;border-top:1px solid #eee;">
  <p style="margin:0;font-size:12px;color:#bbb;text-align:center;line-height:1.6;">このメールは自動送信です。返信はできません。<br>&copy; RACE STREAM PRO</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

async function sendEmail(to: string, subject: string, html: string) {
  const resend = getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY 未設定のため送信をスキップ:", { to, subject });
    return;
  }
  return resend.emails.send({ from: FROM, to, subject, html });
}

export async function sendCreatedEmail(to: string, r: ReservationEmailData) {
  return sendEmail(
    to,
    "【RACE STREAM PRO】予約を受け付けました",
    buildHtml({
      subject: "予約を受け付けました",
      statusLabel: "受付済",
      statusColor: "#d97706",
      statusBg: "rgba(217,119,6,0.12)",
      message: "ご予約ありがとうございます。内容を確認後、管理者が承認します。確定後に改めてご連絡します。",
      r,
      note: "※ 予約が確定するまでサービスはご利用いただけません。",
    })
  );
}

export async function sendConfirmedEmail(to: string, r: ReservationEmailData) {
  return sendEmail(
    to,
    "【RACE STREAM PRO】予約が確定しました",
    buildHtml({
      subject: "予約が確定しました ✅",
      statusLabel: "確定",
      statusColor: "#16a34a",
      statusBg: "rgba(22,163,74,0.12)",
      message: "ご予約が確定しました！開始時刻になりましたら下記の情報でご利用ください。",
      r,
      note: "※ ご不明な点がございましたら管理者までお問い合わせください。",
    })
  );
}

export async function sendCancelledEmail(to: string, r: ReservationEmailData) {
  return sendEmail(
    to,
    "【RACE STREAM PRO】予約がキャンセルされました",
    buildHtml({
      subject: "予約がキャンセルされました",
      statusLabel: "キャンセル",
      statusColor: "#dc2626",
      statusBg: "rgba(220,38,38,0.12)",
      message: "ご予約がキャンセルされました。またのご利用をお待ちしております。",
      r,
    })
  );
}

export async function sendTimeChangedEmail(to: string, r: ReservationEmailData) {
  return sendEmail(
    to,
    "【RACE STREAM PRO】予約時間が変更されました",
    buildHtml({
      subject: "予約時間が変更されました",
      statusLabel: "時間変更",
      statusColor: "#2563eb",
      statusBg: "rgba(37,99,235,0.12)",
      message: "管理者により予約の時間が変更されました。新しい日程をご確認ください。",
      r,
      note: "※ 料金も新しい時間に基づいて再計算されています。",
    })
  );
}
