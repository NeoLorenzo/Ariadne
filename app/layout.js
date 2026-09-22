import "@/fabbro-design/fabbro-tokens.css";
import "./globals.css";
import AppAccessGate from "@/components/AppAccessGate";
import GitHubTaskReadOnlyGuard from "@/components/GitHubTaskReadOnlyGuard";
import PwaRegistrar from "@/components/PwaRegistrar";

export const metadata = {
  metadataBase: new URL("https://ariadne.fabbrosystems.com"),
  title: "Ariadne",
  description:
    "Ariadne is a personal strategy and execution system connecting long-term direction to objectives, opportunities, projects and tasks.",
  robots: {
    index: false,
    follow: false
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-maskable-512.png",
    shortcut: "/icons/icon-192.png"
  },
  appleWebApp: {
    capable: true,
    title: "Ariadne",
    statusBarStyle: "black-translucent"
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body data-fabbro-product="ariadne" className="antialiased">
        <AppAccessGate>
          <PwaRegistrar />
          <GitHubTaskReadOnlyGuard />
          {children}
        </AppAccessGate>
      </body>
    </html>
  );
}
