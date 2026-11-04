/** The first problem with a form field, announced by screen readers as it appears. */
export function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p className="text-sm text-red-600 dark:text-red-400" role="alert">
      {messages[0]}
    </p>
  );
}
