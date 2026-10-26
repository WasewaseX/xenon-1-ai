import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "@fontsource/vazirmatn/400.css";
import "@fontsource/vazirmatn/500.css";
import "@fontsource/vazirmatn/700.css";
import "@fontsource/vazirmatn/800.css";
import "katex/dist/katex.min.css";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { LocaleProvider } from "@/components/xenon/locale-provider";
import { LOCALE_COOKIE_NAME } from "@/lib/xenon/i18n";

export const metadata: Metadata = {
  title: "Xenon 1 — Multimodal AI Agent",
  description:
    "Xenon 1: a bilingual (English & فارسی) multimodal AI agent with deep reasoning, coding, cited web research, vision, speech, image generation, and persistent memory.",
  keywords: [
    "Xenon 1",
    "AI agent",
    "multimodal AI",
    "bilingual assistant",
    "هوش مصنوعی",
    "دستیار هوشمند",
    "دوزبانه",
    "GLM",
    "Z.ai",
  ],
  icons: { icon: "/xenon-icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Next 16: cookies() is async — read the persisted locale for SSR-correct lang/dir
  const cookieStore = await cookies();
  const locale = cookieStore.get(LOCALE_COOKIE_NAME)?.value === "fa" ? "fa" : "en";

  return (
    <html lang={locale} dir={locale === "fa" ? "rtl" : "ltr"} suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground font-sans">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <LocaleProvider locale={locale}>
            {children}
            <Toaster />
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
