import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { RootLayoutClient } from "./layout-client";

const geistSans = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-app-body",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-app-mono",
});

const headingSans = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-app-heading",
});

export const metadata: Metadata = {
  title: "Hushh | Consent-First AI Agents",
  description:
    "Personal AI agents with consent at the core. Your data, your control.",
  keywords: ["AI agents", "personal AI", "Hushh", "consent-first", "privacy"],
  authors: [{ name: "Hushh Labs" }],
  openGraph: {
    title: "Hushh | Consent-First AI Agents",
    description: "Personal AI agents with consent at the core.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <RootLayoutClient
        fontClasses={`${geistSans.variable} ${geistMono.variable} ${headingSans.variable}`}
      >
        {children}
      </RootLayoutClient>
    </html>
  );
}
