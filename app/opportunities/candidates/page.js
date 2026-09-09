"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function OpportunityCandidatesRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/opportunities?view=inbox");
  }, [router]);

  return null;
}
