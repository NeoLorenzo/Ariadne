"use client";

import { useEffect, useState } from "react";

const PHONE_HEIGHT_TO_WIDTH_RATIO_THRESHOLD = 3 / 2;

function isPhoneLikeAspectRatio(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return false;
  }

  const viewportHeightToWidthRatio = height / width;
  return viewportHeightToWidthRatio >= PHONE_HEIGHT_TO_WIDTH_RATIO_THRESHOLD;
}

function detectMobileExperience() {
  if (typeof window === "undefined") {
    return false;
  }

  return isPhoneLikeAspectRatio(window.innerWidth, window.innerHeight);
}

export function useIsMobileExperience() {
  const [isMobileExperience, setIsMobileExperience] = useState(() => detectMobileExperience());

  useEffect(() => {
    const update = () => {
      setIsMobileExperience(detectMobileExperience());
    };

    update();
    window.addEventListener("resize", update);

    return () => {
      window.removeEventListener("resize", update);
    };
  }, []);

  return isMobileExperience;
}

