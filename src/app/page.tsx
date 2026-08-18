export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-4 px-6 py-24">
      <h1 className="text-3xl font-semibold tracking-tight">Job Application Tracker</h1>
      <p className="text-lg text-zinc-600 dark:text-zinc-400">
        Track every application, its status, and follow-up reminders, so nothing slips through.
      </p>
      <p className="text-sm text-zinc-500">
        Milestone 00, project setup. The application itself starts at M01.
      </p>
    </main>
  );
}
