import "./globals.css";
import AppAccessGate from "@/components/AppAccessGate";
import PwaRegistrar from "@/components/PwaRegistrar";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const resolvedBasePath = basePath || "";

export const metadata = {
  title: "Fabbro Factory",
  description: "Personal strategy, projects, tasks, and progress workspace",
  manifest: `${resolvedBasePath}/manifest.webmanifest`,
  icons: {
    icon: `${resolvedBasePath}/icons/icon-192.png`,
    apple: `${resolvedBasePath}/icons/icon-maskable-512.png`,
    shortcut: `${resolvedBasePath}/icons/icon-192.png`
  },
  appleWebApp: {
    capable: true,
    title: "Fabbro Factory",
    statusBarStyle: "black-translucent"
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 antialiased">
        <AppAccessGate>
          <PwaRegistrar />
          {children}
        </AppAccessGate>
      </body>
    </html>
  );
}
