"use client";

import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { PanelLeft, X } from "lucide-react";
import styles from "./sidebar.module.css";

const SidebarContext = createContext(null);
const MOBILE_BREAKPOINT = 900;
const STORAGE_KEY = "fabbro:application-sidebar-expanded";

export function SidebarProvider({ defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const [openMobile, setOpenMobile] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const update = () => {
      setIsMobile(media.matches);
      if (!media.matches) setOpenMobile(false);
    };

    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (isMobile) return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored !== null) setOpen(stored === "true");
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile) {
      window.localStorage.setItem(STORAGE_KEY, String(open));
    }
  }, [isMobile, open]);

  const toggleSidebar = () => {
    if (isMobile) {
      setOpenMobile((current) => !current);
      return;
    }
    setOpen((current) => !current);
  };

  const value = useMemo(
    () => ({
      state: open ? "expanded" : "collapsed",
      open,
      setOpen,
      openMobile,
      setOpenMobile,
      isMobile,
      toggleSidebar
    }),
    [isMobile, open, openMobile]
  );

  return (
    <SidebarContext.Provider value={value}>
      <div
        className={styles.provider}
        data-sidebar-state={value.state}
        data-mobile={isMobile ? "true" : "false"}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used inside SidebarProvider.");
  }
  return context;
}

export function Sidebar({
  side = "left",
  collapsible = "offcanvas",
  className = "",
  children,
  ...props
}) {
  const { state, isMobile, openMobile, setOpenMobile } = useSidebar();
  const isIconCollapsible = collapsible === "icon";

  return (
    <>
      {isMobile && openMobile ? (
        <button
          type="button"
          className={styles.backdrop}
          aria-label="Close navigation"
          onClick={() => setOpenMobile(false)}
        />
      ) : null}
      <aside
        {...props}
        data-sidebar="sidebar"
        data-side={side}
        data-state={state}
        data-collapsible={collapsible}
        data-mobile={isMobile ? "true" : "false"}
        className={[
          styles.sidebar,
          isIconCollapsible ? styles.iconCollapsible : "",
          isMobile ? styles.mobile : "",
          isMobile && openMobile ? styles.mobileOpen : "",
          className
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {isMobile ? (
          <button
            type="button"
            className={styles.mobileClose}
            aria-label="Close navigation"
            onClick={() => setOpenMobile(false)}
          >
            <X aria-hidden="true" />
          </button>
        ) : null}
        {children}
      </aside>
    </>
  );
}

export const SidebarHeader = forwardRef(function SidebarHeader(
  { className = "", ...props },
  ref
) {
  return <div ref={ref} className={[styles.header, className].filter(Boolean).join(" ")} {...props} />;
});

export const SidebarContent = forwardRef(function SidebarContent(
  { className = "", ...props },
  ref
) {
  return <div ref={ref} className={[styles.content, className].filter(Boolean).join(" ")} {...props} />;
});

export const SidebarFooter = forwardRef(function SidebarFooter(
  { className = "", ...props },
  ref
) {
  return <div ref={ref} className={[styles.footer, className].filter(Boolean).join(" ")} {...props} />;
});

export const SidebarGroup = forwardRef(function SidebarGroup(
  { className = "", ...props },
  ref
) {
  return <section ref={ref} className={[styles.group, className].filter(Boolean).join(" ")} {...props} />;
});

export const SidebarGroupLabel = forwardRef(function SidebarGroupLabel(
  { className = "", ...props },
  ref
) {
  return <div ref={ref} className={[styles.groupLabel, className].filter(Boolean).join(" ")} {...props} />;
});

export const SidebarGroupContent = forwardRef(function SidebarGroupContent(
  { className = "", ...props },
  ref
) {
  return <div ref={ref} className={[styles.groupContent, className].filter(Boolean).join(" ")} {...props} />;
});

export const SidebarMenu = forwardRef(function SidebarMenu(
  { className = "", ...props },
  ref
) {
  return <ul ref={ref} className={[styles.menu, className].filter(Boolean).join(" ")} {...props} />;
});

export const SidebarMenuItem = forwardRef(function SidebarMenuItem(
  { className = "", ...props },
  ref
) {
  return <li ref={ref} className={[styles.menuItem, className].filter(Boolean).join(" ")} {...props} />;
});

export const SidebarMenuButton = forwardRef(function SidebarMenuButton(
  {
    href,
    isActive = false,
    icon: Icon,
    tooltip,
    className = "",
    children,
    onClick,
    ...props
  },
  ref
) {
  const classes = [
    styles.menuButton,
    isActive ? styles.menuButtonActive : "",
    className
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {Icon ? <Icon className={styles.menuIcon} aria-hidden="true" /> : null}
      <span className={styles.menuLabel}>{children}</span>
    </>
  );

  if (href) {
    return (
      <a
        ref={ref}
        href={href}
        className={classes}
        aria-current={isActive ? "page" : undefined}
        title={tooltip}
        onClick={onClick}
        {...props}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      ref={ref}
      type="button"
      className={classes}
      title={tooltip}
      onClick={onClick}
      {...props}
    >
      {content}
    </button>
  );
});

export function SidebarRail({ className = "" }) {
  const { isMobile, toggleSidebar } = useSidebar();
  if (isMobile) return null;

  return (
    <button
      type="button"
      data-sidebar="rail"
      className={[styles.rail, className].filter(Boolean).join(" ")}
      aria-label="Toggle navigation"
      title="Toggle navigation"
      onClick={toggleSidebar}
    />
  );
}

export function SidebarTrigger({ className = "", ...props }) {
  const { toggleSidebar } = useSidebar();
  return (
    <button
      type="button"
      className={[styles.trigger, className].filter(Boolean).join(" ")}
      aria-label="Toggle navigation"
      title="Toggle navigation"
      onClick={toggleSidebar}
      {...props}
    >
      <PanelLeft aria-hidden="true" />
    </button>
  );
}

export const SidebarInset = forwardRef(function SidebarInset(
  { className = "", ...props },
  ref
) {
  return <main ref={ref} className={[styles.inset, className].filter(Boolean).join(" ")} {...props} />;
});
