import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev server binds to localhost; opening it as 127.0.0.1 is another origin, and
  // Next blocks the HMR socket for it, which leaves the page reloading in a loop.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
