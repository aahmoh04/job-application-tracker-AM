import type { NextConfig } from "next";

// Sent with every response. Each one closes a door that browsers leave open by
// default. A Content-Security-Policy is deliberately not in here yet, because
// a strict one needs per-request nonces for the scripts Next injects, and a
// loose one would only pretend to protect anything.
const securityHeaders = [
  // Once a browser has seen this header it talks HTTPS to this host for two
  // years, even when someone types the address without the scheme.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // No other site may show this app inside a frame, which is how clickjacking
  // tricks people into pressing buttons they cannot see.
  { key: "X-Frame-Options", value: "DENY" },
  // A response declared as text stays text, even if its content looks like a
  // script that the browser would rather run.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Links to other sites get the origin, never the full path, so an application
  // id in the address does not travel along to a job posting.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The app never asks for these, so no page is allowed to.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
