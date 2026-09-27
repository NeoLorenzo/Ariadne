"use client";

import { useEffect, useRef, useState } from "react";

// Reports once when an element first scrolls into view. Environments without
// IntersectionObserver (or with reduced motion) resolve immediately.
export function useInView({ threshold = 0.25, rootMargin = "0px 0px -10% 0px" } = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || inView) return undefined;
    if (typeof IntersectionObserver === "undefined" || prefersReducedMotion()) {
      setInView(true);
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setInView(true);
        observer.disconnect();
      }
    }, { threshold, rootMargin });
    observer.observe(element);
    return () => observer.disconnect();
  }, [inView, threshold, rootMargin]);

  return [ref, inView];
}

export function prefersReducedMotion() {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return matches;
}
