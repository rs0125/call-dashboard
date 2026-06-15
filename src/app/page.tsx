import { OverviewWindows } from "@/components/OverviewWindows";

// Always read fresh from the DB (it's mutated by the Go service out-of-band).
export const dynamic = "force-dynamic";

export default function OverviewPage() {
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p className="sub">
            Calls across all employees, by time window — newest first.
          </p>
        </div>
      </div>

      <OverviewWindows />
    </div>
  );
}
