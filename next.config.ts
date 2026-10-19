import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Importação aceita até 10 arquivos de 5 MB
    serverActions: { bodySizeLimit: "52mb" },
  },
};

export default nextConfig;
