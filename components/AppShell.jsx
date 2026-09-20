"use client";

import { useEffect } from "react";
import AuthPanel from "@/components/AuthPanel";
import AriadneSidebar from "@/components/AriadneSidebar";
import GitHubAppInstallationLinker from "@/components/GitHubAppInstallationLinker";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar
} from "@/fabbro-design/components/application-sidebar/react/sidebar";
import styles from "./AppShell.module.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const PAGE_LABELS = {
  dashboard: "Dashboard",
  tasks: "Tasks",
  opportunities: "Opportunities"
};

export default function AppShell({
  activeNavItem = "",
  currentPageLabel = "",
  hideMobileNav = false,
  children
}) {
  return (
    <SidebarProvider defaultOpen>
      <AppShellContents
        activeNavItem={activeNavItem}
        currentPageLabel={currentPageLabel || PAGE_LABELS[activeNavItem] || ""}
        hideMobileNav={hideMobileNav}
      >
        {children}
      </AppShellContents>
    </SidebarProvider>
  );
}

function AppShellContents({
  activeNavItem,
  currentPageLabel,
  hideMobileNav,
  children
}) {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();

  useEffect(() => {
    if (hideMobileNav && isMobile && openMobile) {
      setOpenMobile(false);
    }
  }, [hideMobileNav, isMobile, openMobile, setOpenMobile]);

  return (
    <>
      <GitHubAppInstallationLinker />
      <AriadneSidebar activeNavItem={activeNavItem} basePath={basePath} />

      <SidebarInset className={styles.inset}>
        <header className={styles.utilityBar}>
          <div className={styles.context}>
            {!hideMobileNav ? <SidebarTrigger /> : null}
            {currentPageLabel ? (
              <span className={styles.pageLabel}>{currentPageLabel}</span>
            ) : null}
          </div>

          <div className={styles.utilities}>
            <img
              className={styles.familyMark}
              src={`${basePath}/brand/fabbro-mark.svg`}
              alt="Fabbro Systems"
            />
            <AuthPanel compact />
          </div>
        </header>

        <div className={styles.workspace}>
          <div className="page-content">{children}</div>
        </div>
      </SidebarInset>
    </>
  );
}
