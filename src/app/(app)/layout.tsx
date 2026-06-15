import Brand from "@/components/Brand";
import NavLinks from "@/components/NavLinks";
import UserMenu from "@/components/UserMenu";
import { requireUser } from "@/lib/auth";

// Gate for every real page. requireUser() redirects to /login when there's no
// valid session, so nothing below renders for signed-out (or de-whitelisted)
// visitors. force-dynamic because the gate reads the session cookie per request.
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="inner">
          <Brand href="/" subtitle="Dashboard" />
          <nav className="nav">
            <NavLinks />
          </nav>
          <div className="nav-end">
            <UserMenu name={user.name} email={user.email} />
          </div>
        </div>
      </header>
      <main className="app-main">{children}</main>
      <footer className="app-footer">
        © {new Date().getFullYear()} WareOnGo · Calls Dashboard
      </footer>
    </div>
  );
}
