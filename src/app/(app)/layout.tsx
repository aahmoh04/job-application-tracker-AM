import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth/actions";
import { getSession } from "@/lib/auth/cookies";

/**
 * Wraps every signed-in page. The session check sits here as well as in each
 * page, because a layout runs before its pages and catches anything new that
 * gets added under this folder later.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await getSession();

  if (!session) {
    redirect("/sign-in");
  }

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
