"use client";

import { useEffect } from "react";

export default function PwaRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // Development chunks are not content-hashed, so the cache-first worker
    // would keep serving stale code. Only production builds are installable.
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => undefined);
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Ignore service worker registration failures.
    });
  }, []);

  return null;
}
