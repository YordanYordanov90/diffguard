import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import { clerkAppearance } from "@/lib/auth/clerk-appearance";

import "./globals.css";

export const metadata: Metadata = {
  title: "DiffGuard",
  description: "Security-first pull request reviews.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-bg-base text-text-primary">
        <ClerkProvider appearance={clerkAppearance}>{children}</ClerkProvider>
      </body>
    </html>
  );
}
