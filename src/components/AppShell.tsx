"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "./api";
import { FlashProvider } from "./Flash";

export type Me = {
  email: string; company: string; plan: string;
  tokens: { monthly: number; extra: number; total: number; cap: number };
  mailboxes: { id: string; kind: string; address: string; senderName: string | null; authorityId: string | null; status: string; error: string | null; lastSyncAt: string | null; historyDone: boolean; queued: number; readCount: number }[];
  forwardAddress: string;
  batchQueue: number;
  autopilot: "off" | "draft" | "send"; autoPerDay: number;
  limits: { outreach: boolean; agreements: boolean; inboxes: number; perDay: number; planName: string };
  sending: { emailsPerDay: number; gapMin: number; gapMax: number; liInvitesPerDay: number; liDmsPerDay: number };
  authorities: { id: string; name: string; mc: string | null; loads: number }[];
  features: { microsoft: boolean; providers: string[]; ai: boolean; stripe: boolean };
};
const MeCtx = createContext<{ me: Me | null; refresh: () => void }>({ me: null, refresh: () => {} });
export const useMe = () => useContext(MeCtx);

const TABS = [["/app", "Prospects"], ["/app/outreach", "Outreach"], ["/app/freight", "My freight"]] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const r = useRouter(); const path = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [menu, setMenu] = useState(false);
  const [q, setQ] = useState("");
  const refresh = useCallback(() => { api<Me>("/api/me").then(setMe).catch(() => r.push("/signin")); }, [r]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { const close = () => setMenu(false); document.addEventListener("click", close); return () => document.removeEventListener("click", close); }, []);
  const ask = (e: React.FormEvent) => { e.preventDefault(); if (q.trim()) r.push(`/app/ask?q=${encodeURIComponent(q.trim())}`); };
  const signout = async () => { await api("/api/auth/signout", { method: "POST" }); r.push("/"); };
  return (
    <MeCtx.Provider value={{ me, refresh }}>
      <FlashProvider>
        <div className="view on">
          <div className="appbar"><div className="appbar-in">
            <div className="logo"><b></b>Direct Shipper</div>
            <nav className="tabs">
              {TABS.map(([href, label]) => <Link key={href} className={`tab${(href === "/app" ? path === "/app" : path.startsWith(href)) ? " on" : ""}`} href={href}>{label}</Link>)}
            </nav>
            <form className="ask" onSubmit={ask}><input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask your freight…" aria-label="Ask your freight" /><button className="ask-go" aria-label="Ask">&rarr;</button></form>
            <div className="bal">
              <span style={{ color: "var(--steel)" }}>{me ? me.plan[0].toUpperCase() + me.plan.slice(1) : ""}</span>
              <span className="bal-amt">{me ? `${me.tokens.total} tokens` : "…"}</span>
              <div className={`menu${menu ? " open" : ""}`} onClick={(e) => e.stopPropagation()}>
                <button className="btn-ghost menu-btn" onClick={() => setMenu(!menu)} aria-haspopup="true" aria-expanded={menu}>Account <i>&#9662;</i></button>
                <div className="menu-list" role="menu">
                  <Link role="menuitem" href="/app/settings/sources" onClick={() => setMenu(false)}>Settings</Link>
                  <Link role="menuitem" href="/app/settings/billing" onClick={() => setMenu(false)}>Billing &amp; plan</Link>
                  <div className="menu-sep"></div>
                  <button role="menuitem" onClick={signout}>Sign out</button>
                </div>
              </div>
            </div>
          </div></div>
          <div className="appwrap">{children}</div>
        </div>
      </FlashProvider>
    </MeCtx.Provider>
  );
}
