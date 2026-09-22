import DashboardPage from "./dashboard/page";

const description =
  "Ariadne is a personal strategy and execution system that connects long-term direction to strategic objectives, opportunities, projects and tasks so current work stays tied to what matters.";

export const metadata = {
  title: "Ariadne | Personal strategy and execution",
  description,
  alternates: {
    canonical: "/"
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1
    }
  },
  openGraph: {
    type: "website",
    siteName: "Ariadne",
    title: "Ariadne | Turn direction into action",
    description,
    url: "/",
    images: [
      {
        url: "https://fabbrosystems.com/og/ariadne.png",
        width: 1200,
        height: 627,
        alt: "Ariadne — Turn direction into action"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Ariadne | Turn direction into action",
    description:
      "Personal strategy and execution connecting long-term direction to priorities, opportunities, projects and tasks.",
    images: ["https://fabbrosystems.com/og/ariadne.png"]
  }
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://ariadne.fabbrosystems.com/#website",
      url: "https://ariadne.fabbrosystems.com/",
      name: "Ariadne",
      description
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://ariadne.fabbrosystems.com/#application",
      name: "Ariadne",
      url: "https://ariadne.fabbrosystems.com/",
      applicationCategory: "ProductivityApplication",
      operatingSystem: "Web",
      description
    }
  ]
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <DashboardPage />
    </>
  );
}
