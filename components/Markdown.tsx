"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

function CodeBlock({ language, children }: { language?: string; children: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleDownload() {
    const blob = new Blob([children], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = language ? `code.${language === "javascript" ? "js" : language === "typescript" ? "ts" : language}` : "code.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleView() {
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(`<html><head><title>Code - ${language || "text"}</title><style>body{margin:0;padding:20px;font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:13px;background:#0a0a0a;color:#fafafa;white-space:pre-wrap;}</style></head><body>${children.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</body></html>`);
      w.document.close();
    }
  }

  return (
    <div className="code-block-wrap">
      {language && <span className="code-lang">{language}</span>}
      <div className="code-toolbar">
        <button className="code-tb-btn" title={copied ? "Tersalin" : "Salin"} onClick={handleCopy}>
          {copied ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          )}
        </button>
        <button className="code-tb-btn" title="Unduh" onClick={handleDownload}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
        </button>
        <button className="code-tb-btn" title="Buka di tab baru" onClick={handleView}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg>
        </button>
      </div>
      <pre><code>{children}</code></pre>
    </div>
  );
}

export function Markdown({ content }: { content: string }) {
  return (
    <div className="md-wrap">
      <div className="md-body">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={{
            a: ({ node, ...props }) => (
              <a {...props} target="_blank" rel="noopener noreferrer" />
            ),
            code({ node, className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || "");
              const codeStr = String(children).replace(/\n$/, "");
              if (match || codeStr.includes("\n")) {
                return <CodeBlock language={match?.[1]}>{codeStr}</CodeBlock>;
              }
              return <code className={className} {...props}>{children}</code>;
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
