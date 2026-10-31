import Link from "next/link";

// Placeholder: the landing page is owned by M1 and replaces this file.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 p-6">
      <h1 className="text-4xl font-semibold">Cadence</h1>
      <p className="text-ink-2">Recurring revenue, kept in time.</p>
      <Link className="text-plum underline" href="/login">Log in</Link>
    </main>
  );
}
