import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

function ThemeScript() {
  // Sets a stable initial theme before hydration to avoid flash.
  const code = `
(() => {
  try {
    const key = "pf-theme";
    const saved = localStorage.getItem(key);
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = saved || (prefersDark ? "dark" : "light");
    document.documentElement.dataset.theme = theme;
  } catch {}
})();
`.trim();
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

const plexSans = IBM_Plex_Sans({
  variable: "--pf-font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const fraunces = Fraunces({
  variable: "--pf-font-display",
  subsets: ["latin"],
  weight: ["600"],
});

export const metadata: Metadata = {
  title: "PrepTracker",
  description: "Spaced repetition interview prep tracker.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className={`${plexSans.variable} ${fraunces.variable} antialiased`}>{children}</body>
    </html>
  );
}
