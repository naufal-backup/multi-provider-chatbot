"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

export function Markdown({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div style={{ position: "relative" }} className="md-wrap">
      <button
        onClick={handleCopy}
        className="md-copy"
        title={copied ? "Tersalin" : "Salin"}
        style={{
          position: "absolute",
          top: -4,
          right: -6,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          opacity: 0,
          color: "var(--md-on-surface-variant)",
          fontSize: 12,
          padding: 4,
        }}
      >
        {copied ? "✓" : "⧉"}
      </button>
      <style>{`.md-wrap:hover .md-copy{opacity:.7}`}</style>
      <div className="md-body">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={{
            a: ({ node, ...props }) => (
              <a {...props} target="_blank" rel="noopener noreferrer" />
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}