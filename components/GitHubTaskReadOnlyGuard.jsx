"use client";

import { useEffect } from "react";

export default function GitHubTaskReadOnlyGuard() {
  useEffect(() => {
    const applyGitHubReadOnlyState = () => {
      document.querySelectorAll(".task-editor-main-content").forEach((container) => {
        if (!container.querySelector(".task-editor-github-source")) return;

        const descriptionField = container.querySelector("#task-description");
        if (descriptionField instanceof HTMLTextAreaElement) {
          descriptionField.readOnly = true;
          descriptionField.setAttribute("aria-readonly", "true");
          descriptionField.title = "Description is synced from GitHub";
        }
      });
    };

    applyGitHubReadOnlyState();
    const observer = new MutationObserver(applyGitHubReadOnlyState);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return null;
}
