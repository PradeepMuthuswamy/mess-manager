import type { Metadata } from "next";

import { getCurrentUser } from "@/lib/auth/get-current-user";

import { Hero } from "./_sections/hero";
import { TrustStrip } from "./_sections/trust-strip";
import { Capabilities } from "./_sections/capabilities";
import { HowAccessWorks } from "./_sections/how-access-works";
import { Governance } from "./_sections/governance";
import { BuiltForRoles } from "./_sections/built-for-roles";
import { Faq } from "./_sections/faq";
import { CtaBand } from "./_sections/cta-band";
import { FAQ_ITEMS } from "./_sections/faq-data";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const description =
  "Officers Mess is an invitation-only, multi-unit platform for ration, bar, guest rooms, parties and billing. Bills reconcile against versioned rates, every change is audit-logged, and access is capability-scoped per appointment.";

export const metadata: Metadata = {
  title: "Officers Mess — Multi-unit ration, bar, rooms & billing",
  description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Officers Mess",
    title: "Officers Mess — Multi-unit ration, bar, rooms & billing",
    description,
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: "Officers Mess — Multi-unit ration, bar, rooms & billing",
    description,
  },
};

function JsonLd() {
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "Officers Mess",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description,
        url: siteUrl,
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "INR",
          description: "Internal, invitation-only access.",
        },
      },
      {
        "@type": "Organization",
        name: "Officers Mess",
        url: siteUrl,
      },
      {
        "@type": "WebSite",
        name: "Officers Mess",
        url: siteUrl,
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ_ITEMS.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}

export default async function MarketingHome() {
  const user = await getCurrentUser();
  return (
    <>
      <JsonLd />
      <Hero user={user} />
      <TrustStrip />
      <Capabilities />
      <HowAccessWorks />
      <Governance />
      <BuiltForRoles />
      <Faq />
      <CtaBand user={user} />
    </>
  );
}
