import type { Role } from "@prisma/client";

export interface NavItem {
  title: string;
  href: string;
  icon: string; // Lucide icon name
  roles: Role[];
  badge?: string;
  children?: NavItem[];
}

export const teamMemberNav: NavItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: "LayoutDashboard",
    roles: ["TEAM_MEMBER", "MASTER"],
  },
  {
    title: "Campaigns",
    href: "/campaigns",
    icon: "Send",
    roles: ["TEAM_MEMBER", "MASTER"],
  },
  {
    title: "Leads",
    href: "/leads",
    icon: "Users",
    roles: ["TEAM_MEMBER", "MASTER"],
  },
  {
    title: "Inbox",
    href: "/inbox",
    icon: "Inbox",
    roles: ["TEAM_MEMBER", "MASTER"],
  },
  {
    title: "Mailboxes",
    href: "/mailboxes",
    icon: "Mail",
    roles: ["TEAM_MEMBER", "MASTER"],
  },
];

export const adminNav: NavItem[] = [
  {
    title: "Admin Overview",
    href: "/admin",
    icon: "BarChart3",
    roles: ["MASTER"],
  },
  {
    title: "Email Testing",
    href: "/admin/email-testing",
    icon: "Zap",
    roles: ["MASTER"],
  },
  {
    title: "Team Members",
    href: "/admin/team",
    icon: "UserCog",
    roles: ["MASTER"],
  },
  {
    title: "All Campaigns",
    href: "/admin/campaigns",
    icon: "FolderOpen",
    roles: ["MASTER"],
  },
  {
    title: "All Mailboxes",
    href: "/admin/mailboxes",
    icon: "Server",
    roles: ["MASTER"],
  },
  {
    title: "Audit Log",
    href: "/admin/audit-log",
    icon: "ScrollText",
    roles: ["MASTER"],
  },
  {
    title: "Settings",
    href: "/admin/settings",
    icon: "Settings",
    roles: ["MASTER"],
  },
];

export function getNavItems(role: Role): { main: NavItem[]; admin: NavItem[] } {
  return {
    main: teamMemberNav.filter((item) => item.roles.includes(role)),
    admin: role === "MASTER" ? adminNav : [],
  };
}
