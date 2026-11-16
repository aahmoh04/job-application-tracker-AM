import type { PostingResult } from "./actions";

/**
 * What the page holds after a read of a posting, given what it held before.
 *
 * A read that fails brings a message and no suggestion. The form keeps the
 * last suggestion it got in that case, because by then the user may have
 * corrected half of it, and a failed second read is no reason to empty it.
 *
 * This runs in the browser and not in the action. The action would have to
 * take the earlier suggestion back from the browser to return it, and what
 * comes from the browser is input, not something to hand back unchecked.
 */
export function afterRead(previous: PostingResult, result: PostingResult): PostingResult {
  return {
    message: result.message,
    suggestion: result.suggestion ?? previous.suggestion,
  };
}
