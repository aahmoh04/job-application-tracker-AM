/**
 * Pages are rendered on the server, so a date formatter without a time zone
 * follows wherever the code happens to run. On Vercel that is UTC, which
 * would put every time in the timeline one or two hours off for someone in
 * Germany. Both formatters therefore say which zone they mean.
 */

/**
 * For calendar dates such as "applied on". They are stored as midnight UTC,
 * because that is what new Date() makes of the YYYY-MM-DD a date input sends,
 * so they are shown in UTC as well. Any zone west of Greenwich would otherwise
 * print the day before.
 */
export const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * For moments, such as the entries in the timeline. A fixed German zone is a
 * simplification. Showing every visitor their own local time would mean
 * formatting in the browser or storing a time zone per user.
 */
export const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});
