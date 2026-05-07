import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Header } from "@/components/header";
import "./globals.css";

// Inter via next/font/google. The `--font-inter` CSS variable is referenced
// by globals.css's `--font-sans` token (Story 5-1, BA Decisions В§2). Demo
// HTML uses the Google Fonts CDN <link>; production must NOT — next/font
// handles preloading + subsetting + zero-CLS rendering.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "DeskHive",
  description: "Discover and book coworking desks.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Header />
        <div className="flex-1">{children}</div>
        <footer className="site-footer">
          <div className="site-footer-inner">
            <span>В© {new Date().getFullYear()} DeskHive</span>
            <span
              className="font-mono"
              style={{
                fontSize: "11px",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--color-neutral-400)",
              }}
            >
              MVP · v0.1
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
