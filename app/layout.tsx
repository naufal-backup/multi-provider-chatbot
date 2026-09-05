import type { Metadata } from "next";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

const faviconSvg = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%23111'/><path d='M50 22a14 14 0 0 0-14 14v10h28V36a14 14 0 0 0-14-14z' fill='none' stroke='%23fff' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'/><rect x='18' y='46' width='64' height='42' rx='8' fill='none' stroke='%23fff' stroke-width='5'/><path d='M50 56v8M38 74h24' fill='none' stroke='%23fff' stroke-width='5' stroke-linecap='round'/></svg>`;

export const metadata: Metadata = {
  title: "Asisten",
  description: "Serverless multi-provider AI chatbot with BYOK, fully local data.",
  icons: { icon: faviconSvg },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Google+Sans+Text:wght@400;500;700&family=Roboto:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}