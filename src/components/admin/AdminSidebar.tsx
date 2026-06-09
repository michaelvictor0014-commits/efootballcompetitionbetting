import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  BarChart3, Users, History, Send, Calendar, Wallet, ClipboardList, Trophy,
  Server, Home, Settings as SettingsIcon,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import lslLogo from "@/assets/lsl-logo.png";

export type AdminNavItem = {
  key: string;
  label: string;
  icon: any;
  admin?: boolean; // admin-only
  modOk?: boolean; // visible to mods
  alertKey?: string;
};

// Primary admin navigation — mirrors the console sidebar design.
const NAV: AdminNavItem[] = [
  { key: "analytics",  label: "Analytics",   icon: BarChart3,     modOk: true },
  { key: "users",      label: "Users",       icon: Users,         modOk: true, alertKey: "users" },
  { key: "matches",    label: "Matches",     icon: Trophy,        modOk: true },
  { key: "events",     label: "Events",      icon: Calendar,      admin: true },
  { key: "bettracker", label: "Bet Tracker", icon: ClipboardList, admin: true, alertKey: "bettracker" },
  { key: "pnl",        label: "P&L",         icon: Wallet,        admin: true },
  { key: "audit",      label: "Audit Logs",  icon: History,       admin: true },
  { key: "broadcast",  label: "Broadcast",   icon: Send,          admin: true },
];

export function AdminSidebar({
  activeTab,
  onSelect,
  isAdmin,
  isMod,
  alerts,
}: {
  activeTab: string;
  onSelect: (key: string) => void;
  isAdmin: boolean;
  isMod: boolean;
  alerts: Record<string, number>;
}) {
  const { state, setOpenMobile, isMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const nav = useNavigate();

  const items = NAV.filter((n) => (n.admin ? isAdmin : true) || (n.modOk && (isAdmin || isMod)));
  const goHome = () => { if (isMobile) setOpenMobile(false); nav({ to: "/" }); };

  return (
    <Sidebar collapsible="icon" className="border-r border-primary/20">
      <SidebarHeader className="border-b border-primary/15 px-2 py-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-gradient-gold grid place-items-center shadow-gold overflow-hidden ring-1 ring-primary/40 shrink-0">
            <img src={lslLogo} alt="LSL" className="h-7 w-7 object-contain" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground leading-none">Lomita</div>
              <div className="text-sm font-bold gradient-gold-text leading-tight truncate">Admin Console</div>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-[10px] tracking-[0.25em]">NAVIGATION</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.key;
                const count = item.alertKey ? alerts[item.alertKey] ?? 0 : 0;
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      isActive={active}
                      onClick={() => {
                        onSelect(item.key);
                        if (isMobile) setOpenMobile(false);
                      }}
                      className={`text-[12px] ${active ? "bg-primary/15 text-primary border-l-2 border-primary" : ""}`}
                      tooltip={collapsed ? item.label : undefined}
                    >
                      <Icon className="h-4 w-4" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {count > 0 && !collapsed && (
                        <SidebarMenuBadge className="bg-destructive text-destructive-foreground">{count}</SidebarMenuBadge>
                      )}
                      {count > 0 && collapsed && (
                        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-background" />
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {!collapsed && isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] tracking-[0.25em]">SERVER STATUS</SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="px-2 py-1 space-y-2 text-[10px]">
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold"><span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />Online</div>
                {[["CPU", 24], ["RAM", 41], ["DISK", 63]].map(([l, v]) => (
                  <div key={l as string}>
                    <div className="flex justify-between text-muted-foreground"><span>{l}</span><span>{v}%</span></div>
                    <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden"><div className="h-full bg-gradient-gold" style={{ width: `${v}%` }} /></div>
                  </div>
                ))}
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-primary/15 gap-2">
        {isAdmin && (
          <SidebarMenuButton
            onClick={() => { onSelect("settings"); if (isMobile) setOpenMobile(false); }}
            tooltip={collapsed ? "Manage Server" : undefined}
            className="bg-card/70 border border-primary/30 text-[12px]"
          >
            <Server className="h-4 w-4" />
            {!collapsed && <span>Manage Server</span>}
          </SidebarMenuButton>
        )}
        <SidebarMenuButton
          onClick={goHome}
          tooltip={collapsed ? "Back to Home" : undefined}
          className="text-[12px] text-muted-foreground hover:text-foreground"
        >
          <Home className="h-4 w-4" />
          {!collapsed && <span>Back to Home</span>}
        </SidebarMenuButton>
      </SidebarFooter>
    </Sidebar>
  );
}