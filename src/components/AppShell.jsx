import { useEffect, useState } from "react";
import {
  BarChart3, Bell, Check, ChevronDown, ChevronRight, LogOut, Menu,
  MessageSquare, Package, Plus, Search, Settings, ShoppingCart, UserCog, Users,
  Wallet, Warehouse, X,
} from "lucide-react";
import { navItems } from "../data.js";
import { navIcons } from "../config/navigation-icons.js";

const GROUP_LABELS = {
  crm: "CRM",
  sales: "Satış",
  supply: "Təchizat & Anbar",
  finance: "Maliyyə",
  ops: "Əməliyyat",
  analytics: "Analitika",
  system: "Sistem",
};

const GROUP_ICONS = {
  crm: Users,
  sales: ShoppingCart,
  supply: Warehouse,
  finance: Wallet,
  ops: Package,
  analytics: BarChart3,
  system: Settings,
};

function SidebarNav({ items, active, onSelect }) {
  const groups = [];
  const seen = new Set();
  for (const item of items) {
    if (item.group) {
      if (!seen.has(item.group)) {
        seen.add(item.group);
        groups.push({ type: "group", id: item.group, children: items.filter((entry) => entry.group === item.group) });
      }
    } else {
      groups.push({ type: "item", item });
    }
  }

  const activeGroup = items.find((item) => item.id === active)?.group;
  const [open, setOpen] = useState(() => ({ [activeGroup]: true }));
  useEffect(() => {
    if (activeGroup) setOpen((current) => ({ ...current, [activeGroup]: true }));
  }, [activeGroup]);

  return (
    <nav className="nav-list">
      {groups.map((entry) => {
        if (entry.type === "item") {
          const Icon = navIcons[entry.item.id] || Settings;
          return (
            <button key={entry.item.id} className={`nav-item ${active === entry.item.id ? "active" : ""}`} onClick={() => onSelect(entry.item.id)}>
              <Icon size={17} />
              <span>{entry.item.label}</span>
            </button>
          );
        }

        const isOpen = Boolean(open[entry.id]);
        const GroupIcon = GROUP_ICONS[entry.id] || Users;
        const hasActive = entry.children.some((child) => child.id === active);
        return (
          <div key={entry.id} className={`nav-group ${isOpen ? "open" : ""}`}>
            <button
              type="button"
              className={`nav-item nav-group-head ${hasActive ? "active-group" : ""}`}
              onClick={() => setOpen((current) => ({ ...current, [entry.id]: !current[entry.id] }))}
              aria-expanded={isOpen}
            >
              <GroupIcon size={17} />
              <span style={{ flex: 1, textAlign: "left" }}>{GROUP_LABELS[entry.id] || entry.id}</span>
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {isOpen && (
              <div className="nav-group-children" style={{ display: "flex", flexDirection: "column", gap: 2, paddingLeft: 18, marginTop: 2 }}>
                {entry.children.map((child) => {
                  const Icon = navIcons[child.id];
                  return (
                    <button key={child.id} className={`nav-item ${active === child.id ? "active" : ""}`} onClick={() => onSelect(child.id)}>
                      {Icon && <Icon size={15} />}
                      <span>{child.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export function Sidebar({ active, items = navItems, currentUser, activeRole, mobileNav, onClose, onSelect, onLogout }) {
  const initials = String(currentUser?.name || "AD").split(" ").map((part) => part[0]).join("").slice(0, 2).toLocaleUpperCase("az-AZ");
  return (
    <>
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">E</div>
          <div><div className="brand-name">ERP+CRM AZ</div><div className="brand-subtitle">Azərbaycan Sistemi</div></div>
          <button className="icon-btn sidebar-close" onClick={onClose} aria-label="Menyunu bağla"><X size={18} /></button>
        </div>
        <SidebarNav items={items} active={active} onSelect={onSelect} />
        <button type="button" className="sidebar-logout" onClick={onLogout}><LogOut size={17} aria-hidden="true" /><span>Sistemdən çıx</span></button>
        <div className="admin-card">
          <div className="avatar">{initials}</div>
          <div><div className="admin-name">{currentUser?.name || "Administrator"}</div><div className="admin-mail">{activeRole?.name || currentUser?.email}</div></div>
        </div>
      </aside>
      {mobileNav && <button className="scrim" onClick={onClose} aria-label="Menyunu bağla" />}
    </>
  );
}

export function Topbar({ query, setQuery, unread, messages, onMenu, onMessages, onNotifications, currentUser, activeRole, users = [], onLogin, onLogout, canSwitchUser = true }) {
  return (
    <header className="topbar">
      <button className="icon-btn mobile-menu" onClick={onMenu} aria-label="Menyunu aç"><Menu size={20} /></button>
      <div className="searchbox">
        <Search size={17} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Müştəri, sifariş, məhsul axtar..." />
        {query && <button className="clear-search" onClick={() => setQuery("")} aria-label="Axtarışı sil"><X size={14} /></button>}
      </div>
      <div className="top-actions">
        {canSwitchUser && (
          <label className="user-switcher">
            <UserCog size={16} />
            <select aria-label="Aktiv istifadəçi" value={currentUser?.id || ""} onChange={(event) => onLogin(event.target.value)}>
              {users.filter((user) => user.status === "Aktiv").map((user) => <option key={user.id} value={user.id}>{user.name} · {user.role}</option>)}
            </select>
          </label>
        )}
        <div className="session-pill"><span>{currentUser?.name}</span><strong>{activeRole?.name}</strong></div>
        <button className="icon-btn badge-host" onClick={onMessages} aria-label="Mesajlar"><MessageSquare size={20} /><span className="counter">{messages}</span></button>
        <button className="icon-btn badge-host" onClick={onNotifications} aria-label="Bildirişlər"><Bell size={20} /><span className="counter danger">{unread}</span></button>
        <button className="secondary-btn logout-btn" onClick={onLogout}>Çıxış</button>
      </div>
    </header>
  );
}

export function PageHeader({ meta, onAction, showAction = true, canAct = true, disabledReason = "" }) {
  if (!meta) return null;
  const actionLabel = meta.action || "";
  return (
    <div className="page-header">
      <div><h1>{meta.title}</h1><p>{meta.subtitle}</p></div>
      {showAction && actionLabel && (
        <button className="primary-btn" onClick={onAction} disabled={!canAct} title={!canAct ? disabledReason : ""}>
          {actionLabel.includes("Yeni") ? <Plus size={16} /> : <Check size={16} />}{actionLabel}
        </button>
      )}
    </div>
  );
}
