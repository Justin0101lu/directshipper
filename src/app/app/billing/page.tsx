"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, tok } from "@/components/api";
import { useFlash } from "@/components/Flash";
import { useMe } from "@/components/AppShell";
import type { PLANS } from "@/lib/plans";

type B = { monthly: number; extra: number; total: number; cap: number; plan: string; today: number; plans: typeof PLANS; items: { what: string; cost: number }[]; free: string[]; log: { id: string; delta: number; what: string; createdAt: string }[]; stripe: boolean };

export default function Billing() {
  const { refresh } = useMe(); const { flash } = useFlash();
  const [b, setB] = useState<B | null>(null); const [cap, setCap] = useState("");
  const load = () => api<B>("/api/billing").then((x) => { setB(x); setCap(String(x.cap)); });
  useEffect(() => { load(); }, []);
  async function checkout(json: { plan?: string; tokens?: number }) {
    try { const { url } = await api<{ url: string }>("/api/billing/checkout", { method: "POST", json }); location.href = url; }
    catch (x) { flash((x as Error).message, "err"); }
  }
  async function portal() { try { const { url } = await api<{ url: string }>("/api/billing/portal", { method: "POST" }); location.href = url; } catch (x) { flash((x as Error).message, "err"); } }
  async function saveCap() { await api("/api/billing/cap", { method: "POST", json: { cap: Number(cap) } }); flash(Number(cap) ? `Direct Shipper stops spending after ${tok(Number(cap))} in a day and tells you.` : "No cap set. Every search still shows its cost before it runs."); load(); refresh(); }
  if (!b) return <p className="hint">Loading…</p>;
  const cur = b.plans[b.plan as keyof typeof b.plans];
  return (
    <>
      <Link className="back" href="/app">&larr; Back to Prospects</Link>
      <div className="pane-h"><div><div className="eyebrow">Settings</div><h2>Plan &amp; tokens</h2><p>One token, one answer. Nothing charged when we come back empty-handed.</p></div></div>
      <div className="panel"><h3>{tok(b.total)} available</h3><p className="ph">On {cur.name}{cur.price ? ` · $${cur.price} a month` : " · free forever"}</p>
        <dl><div className="row"><dt>Monthly tokens left</dt><dd>{b.monthly}</dd></div><div className="row"><dt>Extra tokens (never expire)</dt><dd>{b.extra}</dd></div><div className="row"><dt>Renews with</dt><dd>{cur.monthly} a month</dd></div><div className="row"><dt>Spent today</dt><dd>{b.today}{b.cap ? ` of ${b.cap}` : ""}</dd></div></dl>
        {b.plan !== "free" && b.stripe && <button className="btn-ghost" style={{ marginTop: 12 }} onClick={portal}>Manage subscription</button>}</div>
      <div className="panel"><h3>Your plan</h3><p className="ph">Change any month. Monthly tokens roll over for 12 months; extra tokens never expire. Unlimited users on every paid plan.</p>
        <div className="plans">{Object.values(b.plans).map((p) => { const isCur = p.id === b.plan; return (
          <div className={`plan${isCur ? " rec" : ""}`} key={p.id}>{isCur && <div className="rectag">CURRENT</div>}<div className="nm">{p.name}</div><div className="pr">${p.price}{p.price ? <i>/mo</i> : null}</div><div className="who">{p.who}</div>
            <div className="cta">{isCur ? <button className="btn-ghost" disabled style={{ opacity: .6 }}>Current plan</button> : p.id === "free" ? <button className="btn-ghost" onClick={portal} disabled={!b.stripe}>Cancel to Free</button> : <button className={p.id === "carrier" ? "btn" : "btn-ghost"} onClick={() => checkout({ plan: p.id })} disabled={!b.stripe}>{p.price > cur.price ? "Upgrade" : "Switch"}</button>}</div>
            <ul><li><b>{p.monthly} tokens</b> a month</li>{p.perks.map((t) => <li key={t}>{t}</li>)}{p.off.map((t) => <li key={t} className="off">{t}</li>)}{p.extra ? <li>Extra tokens <b>{Math.round(p.extra * 100)}&cent;</b> each</li> : null}</ul></div>); })}</div>
        {!b.stripe && <p className="hint">Stripe keys are not set on the server yet, so plan changes are off.</p>}</div>
      <div className="panel"><h3>Extra tokens</h3>{cur.extra ? <><p className="ph">{Math.round(cur.extra * 100)}&cent; a token on {cur.name}. They never expire and are only used after your monthly tokens run out.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{[25, 50, 100].map((n) => <button key={n} className="btn-ghost" onClick={() => checkout({ tokens: n })} disabled={!b.stripe}>{n} for ${(n * cur.extra!).toFixed(2)}</button>)}</div></>
        : <p className="ph" style={{ margin: 0 }}>The Free plan does not sell extra tokens. Everything free stays free when you run out. Move to Carrier to buy more.</p>}</div>
      <div className="panel"><h3>Daily cap</h3><p className="ph">A hard ceiling so a big search cannot run away with your month.</p>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", maxWidth: 360 }}><div style={{ flex: 1 }}><label htmlFor="cap">Maximum tokens per day</label><input id="cap" type="text" value={cap} onChange={(e) => setCap(e.target.value)} /></div><button className="btn-ghost" onClick={saveCap}>Save</button></div></div>
      <div className="grid2"><div className="panel"><h3>What a token buys</h3><table className="ratetbl"><tbody>{b.items.map((t) => <tr key={t.what}><td>{t.what}</td><td><b>{t.cost ? tok(t.cost) : "0 tokens"}</b></td></tr>)}</tbody></table></div>
        <div className="panel"><h3>Never costs a token</h3><table className="ratetbl"><tbody>{b.free.map((t) => <tr key={t}><td>{t}</td><td><span className="pill">FREE</span></td></tr>)}</tbody></table></div></div>
      <div className="panel"><h3>Usage</h3><table style={{ border: "none" }}><thead><tr><th>When</th><th>What</th><th className="right">Tokens</th></tr></thead><tbody>
        {b.log.length ? b.log.map((e) => <tr key={e.id} style={{ cursor: "default" }}><td className="log" data-label="When">{new Date(e.createdAt).toLocaleString()}</td><td data-label="What">{e.what}</td><td className="num right" data-label="Tokens">{e.delta > 0 ? "+" : ""}{e.delta}</td></tr>) : <tr style={{ cursor: "default" }}><td colSpan={3} style={{ color: "var(--faint)" }}>No tokens spent yet.</td></tr>}
      </tbody></table></div>
    </>
  );
}
