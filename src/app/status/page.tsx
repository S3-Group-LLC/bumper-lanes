import type { Metadata } from "next";
import { connection } from "next/server";
import { checkBackups, checkSupabase, describeTime, whereAmI, type BackupHealth, type Place } from "@/lib/health";

export const metadata: Metadata = { title: "Status · My Project" };

const placeLabel: Record<Place, string> = {
  live: "Live site — this is what everyone sees.",
  preview: "Preview — a private test copy. Merging the pull request publishes it.",
  development: "Development — running inside your agent's workspace.",
};

type Mark = boolean | null | "warn";

function Row({ ok, title, children }: { ok: Mark; title: string; children: React.ReactNode }) {
  const icon = ok === null ? "○" : ok === "warn" ? "⚠" : ok ? "✓" : "✗";
  const color = ok === null ? "text-black/40" : ok === "warn" ? "text-amber-700" : ok ? "text-green-700" : "text-red-700";
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

function BackupRow({ backups }: { backups: BackupHealth | null }) {
  if (!backups) {
    return (
      <Row ok={null} title="Backups">
        Waiting for the database. Once it&apos;s connected, the time of the latest backup shows here.
      </Row>
    );
  }
  if (backups.state === "recorded") {
    return (
      <Row ok={backups.problems.length ? "warn" : true} title="Backups">
        Last backup: {describeTime(backups.at)} — {backups.covers.join(" + ")}.
        {backups.problems.map((p) => (
          <span key={p} className="mt-1 block">
            {p}
          </span>
        ))}
      </Row>
    );
  }
  return (
    <Row ok={backups.state === "unknown" ? "warn" : null} title="Backups">
      {backups.state === "none" &&
        "No backup recorded yet. Backups run every night once they're switched on — ask your agent to run doctor."}
      {backups.state === "not-set-up" &&
        'Not switched on yet. That\'s fine until your first database change: your agent will walk you through it first. To do it now, ask your agent to "connect backups".'}
      {backups.state === "unknown" && `Couldn't check: ${backups.reason}`}
    </Row>
  );
}

export default async function StatusPage() {
  // Check on every visit, so the page shows the current state, not the state at build time.
  await connection();
  const db = await checkSupabase();
  const backups: BackupHealth | null = db.state === "connected" ? await checkBackups() : null;
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
          {db.state === "misconfigured" && (
            <ul className="list-disc space-y-1 pl-5">
              {db.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
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

        <BackupRow backups={backups} />
      </ul>
      <p className="text-sm text-black/60">
        Something look wrong? Ask your agent to run the <code>doctor</code> skill.
      </p>
    </section>
  );
}
