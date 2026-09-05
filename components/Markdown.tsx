"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Box, IconButton, Tooltip } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
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
    <Box sx={{ position: "relative", "&:hover .md-copy": { opacity: 1 } }}>
      <Tooltip title={copied ? "Copied" : "Copy"}>
        <IconButton
          size="small"
          onClick={handleCopy}
          className="md-copy"
          sx={{
            position: "absolute",
            top: 0,
            right: 0,
            opacity: 0,
            transition: "opacity 0.2s",
            color: "text.secondary",
          }}
        >
          {copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
        </IconButton>
      </Tooltip>

      <Box
        sx={{
          "& img": { maxWidth: "100%", borderRadius: 1, my: 1 },
          "& a": { color: "primary.main" },
          "& h1, & h2, & h3, & h4": { mt: 1, mb: 0.5 },
          "& p": { my: 0.5 },
          "& ul, & ol": { pl: 3, my: 0.5 },
          "& blockquote": {
            borderLeft: "3px solid",
            borderColor: "divider",
            pl: 1.5,
            ml: 0,
            color: "text.secondary",
          },
          "& table": { borderCollapse: "collapse" },
          "& th, & td": { border: "1px solid", borderColor: "divider", px: 1, py: 0.5 },
          wordBreak: "break-word",
        }}
      >
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
      </Box>
    </Box>
  );
}