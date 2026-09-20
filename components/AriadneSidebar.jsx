"use client";

import {
  BriefcaseBusiness,
  LayoutDashboard,
  ListTodo
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar
} from "@/fabbro-design/components/application-sidebar/react/sidebar";
import styles from "./AriadneSidebar.module.css";

const NAV_ITEMS = [
  { key: "dashboard", href: "/", label: "Dashboard", icon: LayoutDashboard },
  { key: "tasks", href: "/tasks", label: "Tasks", icon: ListTodo },
  { key: "opportunities", href: "/opportunities", label: "Opportunities", icon: BriefcaseBusiness }
];

export default function AriadneSidebar({ activeNavItem = "" }) {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const compact = state === "collapsed" && !isMobile;

  return (
    <Sidebar collapsible="icon" aria-label="Ariadne primary navigation">
      <SidebarHeader className={styles.header}>
        <a className={styles.brandLink} href="/" aria-label="Ariadne home">
          <img
            className={compact ? styles.brandMark : styles.brandLockup}
            src={
              compact
                ? "/brand/ariadne-mark.svg"
                : "/brand/ariadne-lockup.svg"
            }
            alt="Ariadne"
          />
        </a>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Direction & execution</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    href={item.href}
                    icon={item.icon}
                    isActive={activeNavItem === item.key}
                    tooltip={item.label}
                    onClick={() => {
                      if (isMobile) setOpenMobile(false);
                    }}
                  >
                    {item.label}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}
