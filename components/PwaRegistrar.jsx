"use client";

import { useEffect } from "react";

export default function PwaRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const swPath = `${basePath}/sw.js`;

    navigator.serviceWorker.register(swPath).catch(() => {
      // Ignore service worker registration failures.
    });
  }, []);

  return null;
}
