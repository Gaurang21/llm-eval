import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "LLM Eval Playground",
  description:
    "Stateless, bring-your-own-key playground: compare models side-by-side with token streaming, score outputs with a typed grader system, and browse a seeded leaderboard.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-surface text-text antialiased">
        {children}
      </body>
    </html>
  );
}
