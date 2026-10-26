"use client";

// زنون ۱ — کانتکست زبان، تأمین‌کننده و قلاب‌های مترجم (مرز "use client")
//
// چرا کانتکست؟ روی سرور، zustand با useSyncExternalStore همیشه getInitialState را
// برمی‌گرداند؛ بنابراین فروش ماژول‌سطح در SSR زبان اولیه را می‌دهد. LocaleProvider
// زبان کوکی سرور را به‌صورت کانتکست تزریق می‌کند تا خروجی SSR با کوکی یکسان بماند.
// روی کلاینت، مقدار فروش (که از documentElement.lang آب‌پراکنی شده و با setLocale
// تغییر می‌کند) معتبر است — پس تغییر زبان بی‌درنگ همه را به‌روز می‌کند.

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { makeTranslator, useI18n, type Locale, type Translator } from "@/lib/xenon/i18n";

export const LocaleContext = createContext<Locale>("en");

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** مترجم واکنش‌گرا که با تغییر زبان به‌روز می‌شود */
export function useT(): Translator {
  const locale = useLocale();
  return useMemo(() => makeTranslator(locale), [locale]);
}

export function LocaleProvider({ locale: ssrLocale, children }: { locale: Locale; children: ReactNode }) {
  const storeLocale = useI18n((s) => s.locale);
  // سرور: زبان کوکی (فروش ماژول‌سطح سرور زبان اولیه را نگه می‌دارد)
  // کلاینت: زبان فروش — هم در آب‌پراکنی با SSR یکسان است، هم با تغییر زبان به‌روز می‌شود
  const effective = typeof window === "undefined" ? ssrLocale : storeLocale;
  return <LocaleContext.Provider value={effective}>{children}</LocaleContext.Provider>;
}
