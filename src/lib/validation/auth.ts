import { z } from "zod";

/**
 * One schema, two jobs. It validates whatever the browser actually sent, and
 * the inferred type is what the rest of the code works with. Writing the type
 * separately would mean two truths that drift apart.
 */

// Trim and lowercase first, then validate the result. The other way round,
// " Test@Example.DE " fails before it is ever cleaned up.
const email = z.string().trim().toLowerCase().pipe(z.email("Please enter a valid email address."));

// Length over composition rules, following NIST SP 800-63B. "P@ssw0rd!" ticks
// every uppercase-digit-symbol box and still sits near the top of every
// wordlist, while a long ordinary phrase does not.
const password = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(128, "That is longer than 128 characters.");

export const signUpSchema = z
  .object({
    email,
    password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "The two passwords do not match.",
    path: ["confirmPassword"],
  });

// Sign-in deliberately only checks that something was typed. Applying the
// sign-up rules here would tell an attacker what the rules are, and would lock
// out accounts created before the rules changed.
export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Please enter your password."),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
