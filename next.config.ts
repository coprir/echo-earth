import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pin tracing to this app — the parent home dir has an unrelated lockfile
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
