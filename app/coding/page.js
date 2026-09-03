"use client";

import { useEffect } from "react";

export default function CodingCompatibilityPage() {
  useEffect(() => {
    const basePath = String(process.env.NEXT_PUBLIC_BASE_PATH || "")
      .trim()
      .replace(/^\/+|\/+$/g, "");
    window.location.replace(`${basePath ? `/${basePath}` : ""}/`);
  }, []);

  return null;
}
