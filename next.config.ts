import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  poweredByHeader: false,
  compress: true,
  // Hébergeur des visuels produits (seed OSS + uploads futurs) — requis par
  // next/image partout dans le storefront (sinon erreur "hostname not configured").
  // Ajouté par 2-b pour débloquer toutes les pages storefront (voir worklog).
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "z-cdn.chatglm.cn" },
      { protocol: "https", hostname: "**" },
    ],
    // Avif + WebP : poids réduit pour mobiles/connexions lentes.
    formats: ["image/avif", "image/webp"],
    // 30 jours de cache côté CDN/navigateur pour les images optimisées.
    minimumCacheTTL: 2592000,
  },
  // Tree-shaking des imports nommés volumineux (gain notable côté client).
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion", "date-fns"],
  },
  // En-têtes de sécurité de base appliquées à toutes les réponses :
  //  - nosniff : pas de détournement MIME ;
  //  - DENY : pas d'encastrement du site dans une iframe (clickjacking) ;
  //  - referrer strict : le jeton d'accès invité (?token=) ne fuit pas vers
  //    des sites tiers depuis les en-têtes Referer ;
  //  - Permissions-Policy : géolocalisation/micro/caméra verrouillés.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ]
  },
};

export default nextConfig;
