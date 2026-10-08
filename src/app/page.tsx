import Link from "next/link";

export default function Home() {
  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-extrabold sm:text-4xl">This is your project.</h1>
      <p className="text-lg">
        Right now it's a blank page. Ask your agent to change it into your idea — describe what you
        want in plain English, then check the preview before you publish.
      </p>
      <div className="rounded-lg border border-black/10 bg-white p-5">
        <h2 className="font-bold">Not sure where to start?</h2>
        <p className="mt-2">
          Ask your agent: <span className="font-mono text-accent">"Run start-my-project"</span>. It
          will interview you about your idea and write it down in <code>PROJECT.md</code>.
        </p>
      </div>
      <p>
        <Link href="/status" className="text-accent underline underline-offset-4">
          Check your project's status →
        </Link>
      </p>
    </section>
  );
}
