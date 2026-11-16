import type { Metadata } from "next";
import { NewApplication } from "./new-application";
import { requireUser } from "@/lib/auth/guard";
import { postingReader, postingReaderAvailable, type ReaderName } from "@/lib/posting/reader";

export const metadata: Metadata = {
  title: "Add application",
};

/**
 * Said right under the box, before anything is pasted. Where a text goes is
 * something to know beforehand, not to find in a README.
 */
const READER_NOTES: Record<ReaderName, string> = {
  ollama: "A local model reads the text. It stays on the machine this app runs on.",
};

export default async function NewApplicationPage() {
  // Nothing to load here, but the page answers like every other signed-in page.
  await requireUser();

  const reader = postingReaderAvailable() ? postingReader() : null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Add application</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Company and role are enough to start. Everything else can follow later.
        </p>
      </div>
      <NewApplication readerNote={reader ? READER_NOTES[reader] : null} />
    </main>
  );
}
