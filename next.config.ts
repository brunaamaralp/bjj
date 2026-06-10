import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  /** Rotas em app/*; o frontend principal continua no Vite (src/pages). */
  reactStrictMode: true,
  /** Evita que Next trate Dashboard.jsx etc. em src/pages como rotas Pages Router. */
  pageExtensions: ['page.tsx', 'page.ts', 'page.jsx', 'page.js'],
  outputFileTracingRoot: projectRoot,
  typescript: {
    // lib/ e api/ compartilham código legado; o build de produção do app é o Vite.
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config) => {
    // Imports ESM com sufixo .js apontam para fontes .ts/.tsx (padrão do projeto Vite).
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.jsx': ['.tsx', '.jsx'],
    };
    return config;
  },
};

export default nextConfig;
