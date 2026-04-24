"use client";

import React, { createContext, useContext, useCallback } from "react";

type Messages = Record<string, unknown>;

interface I18nContextValue {
  locale: string;
  t: (key: string, fallback?: string) => string;
  tRaw: (key: string) => unknown;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function resolve(obj: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

interface I18nProviderProps {
  locale: string;
  messages: Messages;
  children: React.ReactNode;
}

export function I18nProvider({ locale, messages, children }: I18nProviderProps) {
  const t = useCallback(
    (key: string, fallback?: string): string => {
      const val = resolve(messages, key);
      if (typeof val === "string") return val;
      return fallback ?? key;
    },
    [messages]
  );

  const tRaw = useCallback(
    (key: string): unknown => resolve(messages, key),
    [messages]
  );

  return (
    <I18nContext.Provider value={{ locale, t, tRaw }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
