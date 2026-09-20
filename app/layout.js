import "@/fabbro-design/fabbro-tokens.css";
import "./globals.css";
import AppAccessGate from "@/components/AppAccessGate";
import GitHubTaskReadOnlyGuard from "@/components/GitHubTaskReadOnlyGuard";
import PwaRegistrar from "@/components/PwaRegistrar";

export const metadata = {
  title: "Ariadne",
  description: "Personal strategy, projects, tasks, and progress workspace",
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
      <body data-fabbro-product="ariadne" className="bg-slate-950 text-slate-100 antialiased">
        <AppAccessGate>
          <PwaRegistrar />
          <GitHubTaskReadOnlyGuard />
          {children}
        </AppAccessGate>
      </body>
    </html>
  );
}
