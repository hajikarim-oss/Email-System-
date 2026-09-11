import {
  Activity as ActivityIcon,
  FileText,
  Inbox,
  LayoutDashboard,
  Mailbox as MailboxIcon,
  Send,
  Settings,
  ShieldCheck,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

export const navPrimary: NavItem[] = [
  { href: '/inbox', label: 'Mail', icon: Inbox },
  { href: '/prospects', label: 'Prospects', icon: Target },
  { href: '/templates', label: 'Templates', icon: FileText },
  { href: '/mailboxes', label: 'Mailboxes', icon: MailboxIcon },
];

export const navAdmin: NavItem[] = [
  { href: '/admin', label: 'Admin overview', icon: ShieldCheck },
  { href: '/admin/team', label: 'Team', icon: Users },
  { href: '/admin/audit-log', label: 'Audit log', icon: ActivityIcon },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

export const operationalChecks: Array<[string, string, LucideIcon]> = [
  ['Sender authentication', '0 / 0 verified', ShieldCheck],
  ['Bounce protection', 'Within guardrails', ShieldCheck],
  ['AI review queue', '0 drafts waiting', Inbox],
  ['Workspace access', '0 active members', ShieldCheck],
];

export const adminShortcuts: Array<[string, string, LucideIcon]> = [
  ['/admin/team', 'Invite a teammate', Users],
  ['/admin/email-testing', 'Test an email', Send],
  ['/admin/audit-log', 'View audit trail', ActivityIcon],
];
