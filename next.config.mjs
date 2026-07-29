/** @type {import('next').NextConfig} */
const isStaticExport = process.env.STATIC_EXPORT === "true";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
];

const nextConfig = {
  images: {
    unoptimized: true
  },
  poweredByHeader: false,
  ...(basePath ? { basePath } : {}),
  ...(!isStaticExport
    ? {
        async headers() {
          return [
            {
              source: "/:path*",
              headers: securityHeaders
            }
          ];
        }
      }
    : {}),
  ...(isStaticExport
    ? {
        output: "export",
        trailingSlash: true
      }
    : {})
};

export default nextConfig;
