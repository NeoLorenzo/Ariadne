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
      <AriadneSidebar activeNavItem={activeNavItem} />

      <SidebarInset className={styles.inset}>
        <header className={styles.utilityBar}>
          <div className={styles.context}>
            {!hideMobileNav ? <SidebarTrigger /> : null}
            {currentPageLabel ? (
              <nav className={styles.breadcrumb} aria-label="Location">
                <span className={styles.breadcrumbRoot}>Ariadne</span>
                <span className={styles.breadcrumbSeparator} aria-hidden="true">/</span>
                <span className={styles.pageLabel} aria-current="page">{currentPageLabel}</span>
              </nav>
            ) : null}
          </div>

          <div className={styles.utilities}>
            <img
              className={styles.familyMark}
              src="/brand/fabbro-mark.svg"
              alt="Fabbro Systems"
            />
            <span className={styles.utilityDivider} aria-hidden="true" />
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
