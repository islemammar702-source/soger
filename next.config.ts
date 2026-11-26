import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  images: {
    // Optimisation (WebP/AVIF, tailles adaptées) pour les images hébergées sur Cloudinary.
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }],
    formats: ["image/avif", "image/webp"],
  },
  partialPrefetching: true,
  experimental: {
    // Envoi des photos produit : une image (8 Mo max, vérifiée côté serveur) par requête.
    serverActions: { bodySizeLimit: "10mb" },
    proxyClientMaxBodySize: "10mb",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
