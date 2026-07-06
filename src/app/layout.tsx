import type { Metadata } from "next";
import { Space_Grotesk, Figtree } from "next/font/google";
import "./globals.css";

const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
});

const body = Figtree({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Bestpath — the best path to any skill",
    template: "%s · Bestpath",
  },
  description:
    "Type any skill and get a personalized beginner-to-pro roadmap with verified resources, checkpoints, and insights from working professionals.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Bestpath", statusBarStyle: "black" },
};

export const viewport = {
  themeColor: "#0b0e0c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
