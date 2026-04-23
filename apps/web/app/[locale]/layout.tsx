import { NextIntlClientProvider } from "next-intl";
import { locales, type Locale } from "../../i18n";
import type { Metadata } from "next";

import jaMessages from "../../messages/ja.json";
import enMessages from "../../messages/en.json";
import deMessages from "../../messages/de.json";
import frMessages from "../../messages/fr.json";

const messagesMap: Record<Locale, Record<string, unknown>> = {
  ja: jaMessages,
  en: enMessages,
  de: deMessages,
  fr: frMessages,
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: "RaceStreamPro – モータースポーツ特化SRT配信",
  description: "スマートフォン1台でプロ品質のマルチカメラレース配信を実現するクラウドプラットフォーム。",
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const validLocale: Locale = (locales as readonly string[]).includes(locale)
    ? (locale as Locale)
    : "ja";
  const messages = messagesMap[validLocale];

  return (
    <NextIntlClientProvider locale={validLocale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
