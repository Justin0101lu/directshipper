"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const NAV = [["/app/settings/sources", "Sources"], ["/app/settings/agreements", "Broker agreements"], ["/app/settings/billing", "Billing & plan"], ["/app/settings/data", "Your data"]] as const;
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="settings">
      <aside className="settings-nav">
        <div className="eyebrow">Settings</div>
        {NAV.map(([href, label]) => <Link key={href} href={href} className={`settings-link${path.startsWith(href) ? " on" : ""}`}>{label}</Link>)}
        <Link href="/app" className="settings-link back-link">&larr; Back to the app</Link>
      </aside>
      <div className="settings-body">{children}</div>
    </div>
  );
}
