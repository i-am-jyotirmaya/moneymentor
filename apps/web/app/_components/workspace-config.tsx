import {
  BarChart3,
  Bot,
  Flag,
  LayoutDashboard,
  ReceiptText,
  Settings,
  Users,
} from "lucide-react";
import { AppSection } from "./workspace-types";

export const promptIdeas = [
  "groceries for 110 from local market",
  "Joe sent me 300 Rs for chips",
  "where did I spend most this month?",
];

export const transactionPageSize = 10;

export const navItems: Array<{
  section: Exclude<AppSection, "home">;
  label: string;
  icon: typeof Bot;
}> = [
  { section: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { section: "assistant", label: "Assistant", icon: Bot },
  { section: "transactions", label: "Transactions", icon: ReceiptText },
  { section: "reports", label: "Reports", icon: BarChart3 },
  { section: "planning", label: "Planning", icon: Flag },
  { section: "household", label: "Household", icon: Users },
  { section: "settings", label: "Settings", icon: Settings },
];

export function sectionLabel(section: Exclude<AppSection, "home">) {
  return (
    navItems.find((item) => item.section === section)?.label ?? "Dashboard"
  );
}
