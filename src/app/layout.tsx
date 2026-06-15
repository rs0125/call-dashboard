import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Calls Dashboard",
  description: "Calls and per-employee statistics",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a2239",
};

// Root layout is intentionally chrome-free: the app shell (header/nav/footer)
// lives in (app)/layout.tsx behind the auth gate, so /login renders bare.
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={manrope.variable}>
      <body>{children}</body>
    </html>
  );
}
