export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/"
      }
    ],
    sitemap: "https://ariadne.fabbrosystems.com/sitemap.xml",
    host: "https://ariadne.fabbrosystems.com"
  };
}
