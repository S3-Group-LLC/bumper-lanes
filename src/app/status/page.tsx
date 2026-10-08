import type { Metadata } from "next";
import { connection } from "next/server";
import { checkSupabase, whereAmI, type Place } from "@/lib/health";

export const metadata: Metadata = { title: "Status · My Project" };

const placeLabel: Record<Place, string> = {
  live: "Live site — this is what everyone sees.",
  preview: "Preview — a private test copy. Merging the pull request publishes it.",
  development: "Development — running inside your agent's workspace.",
};

function Row({ ok, title, children }: { ok: boolean | null; title: string; children: React.ReactNode }) {
  const icon = ok === null ? "○" : ok ? "✓" : "✗";
  const color = ok === null ? "text-black/40" : ok ? "text-green-700" : "text-red-700";
  return (
    <li className="flex gap-4 rounded-lg border border-black/10 bg-white p-4">
      <span aria-hidden className={`text-xl font-bold ${color}`}>
        {icon}
      </span>
      <div>
        <h2 className="font-bold">{title}</h2>
        <div className="mt-1 text-sm text-black/70">{children}</div>
      </div>
    </li>
  );
}

export default async function StatusPage() {
  // Check on every visit, so the page shows the current state, not the state at build time.
  await connection();
  const db = await checkSupabase();
  const place = whereAmI();
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);

  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-extrabold">Project status</h1>
      <ul className="space-y-3">
        <Row ok title="App">
          Running. {placeLabel[place]}
          {commit && <> Version <code>{commit}</code>.</>}
        </Row>

        <Row ok={db.state === "connected" ? true : db.state === "not-connected" ? null : false} title="Database (Supabase)">
          {db.state === "connected" && "Connected and answering."}
          {db.state === "not-connected" && (
            <>
              Not connected yet — that's fine for now. Connect Supabase to your Vercel project to fill
              in:{" "}
              {db.missing.map((name, i) => (
                <span key={name}>
                  {i > 0 && ", "}
                  <code>{name}</code>
                </span>
              ))}
            </>
          )}
          {db.state === "unreachable" && db.reason}
        </Row>

        <Row ok={null} title="Backups">
          No backup recorded yet. Once backups are switched on, the date of the latest one shows here.
        </Row>
      </ul>
      <p className="text-sm text-black/60">
        Something look wrong? Ask your agent to run the <code>doctor</code> skill.
      </p>
    </section>
  );
}
