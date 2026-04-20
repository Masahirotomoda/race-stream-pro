import Link from "next/link";
import Image from "next/image";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* ── βテスト告知バー ── */}
      <div className="fixed top-0 left-0 right-0 z-[60] bg-yellow-500 text-gray-900 text-center py-2 px-4 text-sm font-bold">
        📣 現在：招待制クローズドテスト中 ｜ 2026年8月より βテスター募集開始予定
        
      </div>

      {/* ── ナビゲーション ── */}
      <nav className="fixed top-8 left-0 right-0 z-50 bg-gray-950/90 backdrop-blur border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <span className="text-xl font-bold text-red-500 tracking-wider">
            RaceStream<span className="text-white">Pro</span>
          </span>
          <div className="flex gap-3">
            <Link
              href="/login"
              className="px-4 py-2 text-sm text-gray-300 hover:text-white transition"
            >
              ログイン
            </Link>
            <Link
              href="/register"
              className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 rounded-lg font-semibold transition"
            >
              無料で始める
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Section 1: Hero ── */}
      <section className="relative pt-24 min-h-screen flex flex-col items-center justify-center overflow-hidden">
        {/* 背景グラデーション */}
        <div className="absolute inset-0 bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 z-0" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(220,38,38,0.12)_0%,_transparent_70%)] z-0" />

        <div className="relative z-10 max-w-6xl mx-auto px-4 py-24 text-center">
          <div className="inline-block mb-6 px-4 py-1 bg-red-600/20 border border-red-600/40 rounded-full text-red-400 text-sm font-medium">
            🏁 モータースポーツ特化 ／ SRT マルチカメラ配信
          </div>

          <h1 className="text-4xl md:text-6xl font-black mb-6 leading-tight">
            レース映像配信を、<br />
            <span className="text-red-500">もっとシンプルに。</span>もっと本格的に。
          </h1>

          <p className="text-lg md:text-xl text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            専用機材も配信スタッフも必要ありません。<br />
            スマートフォンとブラウザだけで、サーキットからプロ品質のマルチカメラ中継を実現します。
          </p>

          <div className="inline-flex items-center gap-3 mb-8 px-5 py-3 bg-yellow-500/10 border border-yellow-500/40 rounded-full">
            <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse inline-block" />
            <span className="text-yellow-400 font-bold text-sm">● 2026年8月 βテスター募集開始予定</span>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Link
              href="/register"
              className="px-8 py-4 bg-red-600 hover:bg-red-500 rounded-xl font-bold text-lg transition transform hover:scale-105 shadow-lg shadow-red-900/40"
            >
              βテスター募集を受け取る →
            </Link>
            <Link
              href="/login"
              className="px-8 py-4 bg-gray-800 hover:bg-gray-700 rounded-xl font-bold text-lg transition border border-gray-700"
            >
              招待済みの方はログイン
            </Link>
          </div>

          {/* YouTube埋め込み */}
          <div className="relative w-full max-w-4xl mx-auto aspect-video rounded-2xl overflow-hidden shadow-2xl shadow-black/60 border border-gray-800">
            <iframe
              src="https://www.youtube.com/embed/RMbAeEmcjjc?autoplay=0&rel=0&modestbranding=1"
              title="RaceStreamPro デモ動画"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 w-full h-full"
            />
          </div>
        </div>
      </section>

      {/* ── Section 2: 課題提起 ── */}
      <section className="py-24 bg-gray-900">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-black mb-4">
              モータースポーツの配信、<br />
              <span className="text-red-400">こんな悩みありませんか？</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {[
              { emoji: "💸", text: "専門の配信機材が高額すぎる" },
              { emoji: "👥", text: "配信スタッフを複数人揃えるのが大変" },
              { emoji: "📡", text: "サーキットの屋外回線が不安定で途切れる" },
              { emoji: "🎥", text: "複数カメラの切り替えが複雑で難しい" },
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-4 p-6 bg-gray-800/60 rounded-xl border border-gray-700"
              >
                <span className="text-3xl">{item.emoji}</span>
                <p className="text-gray-300 font-medium text-lg">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 3: 解決策 ── */}
      <section className="py-24 bg-gray-950">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-black mb-4">
              <span className="text-red-500">RaceStreamPro</span> なら<br />
              すべて解決できます
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {[
              { emoji: "✅", text: "スマートフォンだけで配信開始、専用機材不要" },
              { emoji: "✅", text: "15分単位のレンタル、初期費用ゼロ" },
              { emoji: "✅", text: "SRTプロトコルで不安定回線でも安定配信" },
              { emoji: "✅", text: "マルチカメラをブラウザで一元管理" },
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-4 p-6 bg-red-950/30 rounded-xl border border-red-900/40"
              >
                <span className="text-2xl">{item.emoji}</span>
                <p className="text-white font-medium text-lg">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 4: 機能紹介 ── */}
      <section className="py-24 bg-gray-900">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-black mb-4">主な機能</h2>
            <p className="text-gray-400">プロ品質の配信に必要なすべてが揃っています</p>
          </div>

          {/* Feature 1 */}
          <div className="flex flex-col lg:flex-row items-center gap-12 mb-24">
            <div className="flex-1">
              <div className="inline-block mb-4 px-3 py-1 bg-red-600/20 border border-red-600/40 rounded-full text-red-400 text-sm">
                📱 マルチカメラ SRT 配信
              </div>
              <h3 className="text-2xl md:text-3xl font-black mb-4">
                複数カメラを同時配信、<br />品質をリアルタイム監視
              </h3>
              <p className="text-gray-400 leading-relaxed mb-6">
                スマートフォンをカメラとして使用し、SRTプロトコルで安定した映像を送信。
                ビットレート・パケットロス率をリアルタイムでグラフ表示。
                カメラ接続状況を一画面で把握できます。
              </p>
              <ul className="space-y-2 text-gray-300">
                {["最大8台のカメラを同時配信", "ビットレートグラフ表示", "パケットロス率モニタリング", "カメラ接続状態をリアルタイム確認"].map((item, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="text-red-400">▸</span> {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex-1 w-full">
              <div className="relative aspect-video bg-gray-800 rounded-2xl overflow-hidden border border-gray-700 shadow-xl">
                {/* スクリーンショット差し込み予定 */}
                <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-sm flex-col gap-2">
                  <span className="text-4xl">📸</span>
                  <span>monitor-overview.png</span>
                </div>
              </div>
            </div>
          </div>

          {/* Feature 2 */}
          <div className="flex flex-col lg:flex-row-reverse items-center gap-12 mb-24">
            <div className="flex-1">
              <div className="inline-block mb-4 px-3 py-1 bg-blue-600/20 border border-blue-600/40 rounded-full text-blue-400 text-sm">
                📅 かんたん予約システム
              </div>
              <h3 className="text-2xl md:text-3xl font-black mb-4">
                配信日時を選ぶだけ、<br />サーバーが自動起動
              </h3>
              <p className="text-gray-400 leading-relaxed mb-6">
                予約フォームから配信開始時刻・終了時刻・プランを選択するだけ。
                指定した時間にSRTサーバーが自動的に起動し、
                終了時刻には自動停止します。
              </p>
              <ul className="space-y-2 text-gray-300">
                {["ブラウザだけで予約完結", "SRTサーバー自動起動・停止", "接続情報を自動発行", "予約期間外はアクセス制限で安全"].map((item, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="text-blue-400">▸</span> {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex-1 w-full">
              <div className="relative aspect-video bg-gray-800 rounded-2xl overflow-hidden border border-gray-700 shadow-xl">
                <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-sm flex-col gap-2">
                  <span className="text-4xl">📸</span>
                  <span>reservation-form.png</span>
                </div>
              </div>
            </div>
          </div>

          {/* Feature 3 */}
          <div className="flex flex-col lg:flex-row items-center gap-12">
            <div className="flex-1">
              <div className="inline-block mb-4 px-3 py-1 bg-green-600/20 border border-green-600/40 rounded-full text-green-400 text-sm">
                📊 リアルタイムモニタリング
              </div>
              <h3 className="text-2xl md:text-3xl font-black mb-4">
                OBSサーバーの状態を<br />ブラウザで常時確認
              </h3>
              <p className="text-gray-400 leading-relaxed mb-6">
                CPU・メモリ・GPU・ネットワーク使用率をリアルタイムで表示。
                配信中のサーバー負荷を把握し、
                品質トラブルを早期に検知できます。
              </p>
              <ul className="space-y-2 text-gray-300">
                {["CPU・メモリ使用率をグラフ表示", "GPU（NVIDIA Tesla T4）使用率", "ネットワーク送受信量", "ディスク使用率アラート"].map((item, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="text-green-400">▸</span> {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex-1 w-full">
              <div className="relative aspect-video bg-gray-800 rounded-2xl overflow-hidden border border-gray-700 shadow-xl">
                <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-sm flex-col gap-2">
                  <span className="text-4xl">📸</span>
                  <span>obs-monitor.png</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 5: 利用の流れ ── */}
      <section className="py-24 bg-gray-950">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-black mb-4">利用の流れ</h2>
            <p className="text-gray-400">最短5分で配信準備が完了します</p>
          </div>

          <div className="relative">
            {/* 縦線 */}
            <div className="absolute left-8 top-8 bottom-8 w-0.5 bg-gradient-to-b from-red-600 to-gray-800 hidden md:block" />

            <div className="space-y-8">
              {[
                { step: "01", title: "会員登録（無料）", desc: "メールアドレスとパスワードだけで事前登録。βテスト開始時に優先的にご案内します。", icon: "👤" },
                { step: "02", title: "プラン・日時を予約", desc: "配信日時・終了時刻・プランを選択。カメラ台数に応じた料金が自動計算されます。", icon: "📅" },
                { step: "03", title: "SRTアプリで接続", desc: "発行された接続情報をSRTアプリ（Larix Broadcaster等）に入力するだけ。", icon: "📱" },
                { step: "04", title: "配信スタート！", desc: "モニターページでカメラ接続・ビットレートをリアルタイム確認しながら配信。", icon: "🎬" },
                { step: "05", title: "配信終了・自動停止", desc: "予約終了時刻にサーバーが自動停止。追加作業は一切不要です。", icon: "✅" },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-6 md:ml-0">
                  <div className="flex-shrink-0 w-16 h-16 bg-red-600 rounded-full flex items-center justify-center text-2xl font-black relative z-10">
                    {item.icon}
                  </div>
                  <div className="flex-1 pt-2 pb-8">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-red-400 text-sm font-bold">STEP {item.step}</span>
                      <h3 className="text-xl font-bold">{item.title}</h3>
                    </div>
                    <p className="text-gray-400 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 6: 料金プラン ── */}
      <section className="py-24 bg-gray-900">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-black mb-4">料金プラン</h2>
            <p className="text-gray-400">15分単位のレンタル。使った分だけお支払い。</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            {/* SRT サーバー */}
            <div className="relative p-8 bg-gray-800 rounded-2xl border border-gray-700">
              <h3 className="text-xl font-black mb-1 text-blue-400">SRT サーバー</h3>
              <p className="text-gray-400 text-sm mb-6">SRT受信サーバーのみ。自前のOBS等から送信する方向け。</p>
              <div className="mb-6">
                <span className="text-5xl font-black text-white">¥165</span>
                <span className="text-gray-400 ml-2">/ 15分</span>
              </div>
              <ul className="space-y-3 mb-8 text-gray-300">
                {[
                  "SRT受信サーバー",
                  "最大4カメラ（固定）",
                  "ビットレート監視",
                  "自動起動・停止",
                ].map((f, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="text-blue-400">✓</span> {f}
                  </li>
                ))}
                <li className="flex items-center gap-2 text-gray-500">
                  <span>✕</span> OBS Windows VM なし
                </li>
              </ul>
              <Link
                href="/register"
                className="block w-full text-center py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold transition"
              >
                このプランで始める
              </Link>
            </div>

            {/* SRT + OBS */}
            <div className="relative p-8 bg-gray-800 rounded-2xl border-2 border-red-500 shadow-lg shadow-red-900/30">
              {/* おすすめバッジ */}
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-red-500 rounded-full text-sm font-bold">
                ★ おすすめ
              </div>
              <h3 className="text-xl font-black mb-1 text-red-400">SRT + OBS</h3>
              <p className="text-gray-400 text-sm mb-6">SRTサーバー + Windows VM（OBSインストール済み）。</p>
              <div className="mb-6">
                <span className="text-5xl font-black text-white">¥495</span>
                <span className="text-gray-400 ml-2">/ 15分</span>
              </div>
              <ul className="space-y-3 mb-8 text-gray-300">
                {[
                  "SRT受信サーバー",
                  "最大4カメラ（固定）",
                  "OBS Windows VM 付き",
                  "ビットレート監視",
                  "リソースモニター",
                  "自動起動・停止",
                ].map((f, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="text-red-400">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/register"
                className="block w-full text-center py-3 bg-red-600 hover:bg-red-500 rounded-xl font-bold transition"
              >
                このプランで始める
              </Link>
            </div>
          </div>

          {/* カメラ追加オプション */}
          <div className="p-6 bg-gray-800/50 rounded-xl border border-gray-700 text-center">
            <p className="text-gray-300">
              <span className="text-white font-bold">📷 5台目以降のカメラ追加：</span>
              <span className="text-yellow-400 font-bold ml-2">+¥55 / 台 / 15分</span>
              <span className="text-gray-500 ml-2">（両プラン共通、最大8台まで）</span>
            </p>
          </div>
        </div>
      </section>

      {/* ── Section 7: CTA ── */}
      <section className="py-24 bg-gradient-to-b from-gray-950 to-gray-900">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-5xl font-black mb-6">
            βテスターとして、<br />
            <span className="text-red-500">いち早く体験しませんか？</span>
          </h2>
          <p className="text-gray-400 text-lg mb-10">
            2026年8月のβテスター募集開始に合わせて、<br />
            優先的にご案内いたします。
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register"
              className="px-10 py-4 bg-red-600 hover:bg-red-500 rounded-xl font-black text-xl transition transform hover:scale-105 shadow-xl shadow-red-900/40"
            >
              事前登録する（無料）→
            </Link>
            <Link
              href="/login"
              className="px-10 py-4 bg-gray-800 hover:bg-gray-700 rounded-xl font-bold text-xl transition border border-gray-700"
            >
              招待済みの方はログイン
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-12 bg-gray-950 border-t border-gray-800">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <span className="text-xl font-bold text-red-500 tracking-wider">
              RaceStream<span className="text-white">Pro</span>
            </span>
            <div className="flex gap-6 text-sm text-gray-500">
              <Link href="/login" className="hover:text-gray-300 transition">ログイン</Link>
              <Link href="/register" className="hover:text-gray-300 transition">会員登録</Link>
            </div>
            <p className="text-sm text-gray-600">
              © 2026 RaceStreamPro. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

    </div>
  );
}
