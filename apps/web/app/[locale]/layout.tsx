import { NextIntlClientProvider } from "next-intl";
import { locales, type Locale } from "../../i18n";
import type { Metadata } from "next";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: "RaceStreamPro – モータースポーツ特化SRT配信",
  description:
    "スマートフォン1台でプロ品質のマルチカメラレース配信を実現するクラウドプラットフォーム。",
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // プラグイン不使用のため直接importでメッセージを読み込む
  const validLocale: Locale = (locales as readonly string[]).includes(locale)
    ? (locale as Locale)
    : "ja";

  const messages = (
    await import(`../../messages/${validLocale}.json`)
  ).default;

  return (
    <NextIntlClientProvider locale={validLocale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
