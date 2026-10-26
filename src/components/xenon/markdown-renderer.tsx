"use client";

// زنون ۱ — نمایش‌دهنده مارک‌داون با پشتیبانی فرمول، جدول و بلوک کد
// بلوک‌های کد و فرمول‌ها همیشه چپ‌به‌راست (LTR) رندر می‌شوند.

import { useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Check, Copy } from "lucide-react";
import { useT } from "@/components/xenon/locale-provider";

function CodeBlockCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const t = useT();
  return (
    <button
      type="button"
      aria-label={t("a11y.copyCode")}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
      onClick={() => {
        navigator.clipboard.writeText(text).then(
          () => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          },
          () => undefined
        );
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-primary" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
    </button>
  );
}

const markdownComponents: Components = {
  code({ className, children, ...props }) {
    const text = String(children).replace(/\n$/, "");
    const match = /language-(\w+)/.exec(className ?? "");
    const isBlock = Boolean(match) || text.includes("\n");
    if (!isBlock) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
    const language = match?.[1] ?? "text";
    return (
      <div dir="ltr" className="my-3 overflow-hidden rounded-lg border bg-[#282c34]">
        <div className="flex items-center justify-between px-3 py-1" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
          <span className="font-mono text-xs text-white/60">{language}</span>
          <CodeBlockCopyButton text={text} />
        </div>
        <div className="xenon-code-scroll overflow-x-auto rounded-lg" style={{ fontSize: 13 }}>
          <SyntaxHighlighter
            language={language}
            style={oneDark}
            PreTag="div"
            customStyle={{ margin: 0, padding: "0.75rem 1rem", background: "transparent" }}
            codeTagProps={{ style: { fontFamily: "var(--font-mono)" } }}
          >
            {text}
          </SyntaxHighlighter>
        </div>
      </div>
    );
  },
  a({ href, children, ...props }) {
    return (
      <a href={href} target="_blank" rel="noreferrer" {...props}>
        {children}
      </a>
    );
  },
  table({ children, ...props }) {
    return (
      <div className="xenon-scroll my-2 overflow-x-auto" dir="auto">
        <table {...props}>{children}</table>
      </div>
    );
  },
  img({ src, alt }) {
    return <img src={typeof src === "string" ? src : undefined} alt={alt ?? ""} className="my-2 max-w-full rounded-lg" loading="lazy" />;
  },
};

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="xenon-prose text-[0.95rem]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
