"use server";

import { redirect } from "next/navigation";
import { clearSessionCookie } from "./cookies";

export async function signOut(): Promise<void> {
  await clearSessionCookie();
  redirect("/sign-in");
}
