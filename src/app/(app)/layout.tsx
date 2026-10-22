import Link from "next/link";
import { signOut } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/guard";

/**
 * Wraps every signed-in page. Next renders a layout and its page in parallel,
 * so this check does not replace the one in each page. It makes sure that a
 * page added later without one still ends in a redirect.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireUser();

  return (
    <>
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <nav className="mx-auto flex w-full max-w-4xl items-center gap-6 px-6 py-4">
          <Link href="/dashboard" className="font-semibold tracking-tight">
            JobTracker
          </Link>
          <Link href="/applications" className="text-sm text-zinc-600 dark:text-zinc-400">
            Applications
          </Link>
          <Link href="/analytics" className="text-sm text-zinc-600 dark:text-zinc-400">
            Analytics
          </Link>
          <form action={signOut} className="ml-auto">
            <button type="submit" className="text-sm text-zinc-600 dark:text-zinc-400">
              Sign out
            </button>
          </form>
        </nav>
      </header>
      {children}
    </>
  );
}
