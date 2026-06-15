import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import Brand from "@/components/Brand";
import NavLinks from "@/components/NavLinks";

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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={manrope.variable}>
      <body>
        <div className="app-shell">
          <header className="app-header">
            <div className="inner">
              <Brand href="/" subtitle="Dashboard" />
              <nav className="nav">
                <NavLinks />
              </nav>
              <div className="nav-end" />
            </div>
          </header>
          <main className="app-main">{children}</main>
          <footer className="app-footer">
            © {new Date().getFullYear()} WareOnGo · Calls Dashboard
          </footer>
        </div>
      </body>
    </html>
  );
}
