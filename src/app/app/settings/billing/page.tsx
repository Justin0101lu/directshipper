"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, tok } from "@/components/api";
import { useFlash } from "@/components/Flash";
import { useMe } from "@/components/AppShell";
import type { PLANS } from "@/lib/plans";

type B = {
  monthly: number; extra: number; total: number; cap: number; plan: string; autoTopup: boolean; today: number;
  plans: typeof PLANS; packs: { tokens: number; price: number }[]; topup: { pack: number; below: number; price: number }; welcome: number;
  items: { what: string; cost: number; note?: string }[]; free: string[];
  log: { id: string; delta: number; extra: number; cents: number; what: string; createdAt: string }[];
  stripe: boolean; card: boolean; buyable: Record<string, boolean>;
};
const usd = (cents: number) => `${cents < 0 ? "−" : ""}$${(Math.abs(cents) / 100).toFixed(2)}`;
const cents = (d: number) => `${Math.round(d * 100)}¢`;

export default function Billing() {
  const { refresh } = useMe(); const { flash } = useFlash();
  const [b, setB] = useState<B | null>(null); const [cap, setCap] = useState(""); const [busy, setBusy] = useState(false);
  const load = () => api<B>("/api/billing").then((x) => { setB(x); setCap(String(x.cap)); });
  useEffect(() => { load(); }, []);
  async function checkout(json: { plan?: string; tokens?: number }) {
    setBusy(true);
    try { const { url } = await api<{ url: string }>("/api/billing/checkout", { method: "POST", json }); location.href = url; }
    catch (x) { flash((x as Error).message, "err"); setBusy(false); }
  }
  async function portal() { try { const { url } = await api<{ url: string }>("/api/billing/portal", { method: "POST" }); location.href = url; } catch (x) { flash((x as Error).message, "err"); } }
  async function saveCap() { await api("/api/billing/cap", { method: "POST", json: { cap: Number(cap) } }); flash(Number(cap) ? `Direct Shipper stops spending after ${tok(Number(cap))} in a day and tells you.` : "No cap set. Every search still shows its cost before it runs."); load(); refresh(); }
  async function topup(on: boolean) {
    try { await api("/api/billing/topup", { method: "POST", json: { on } }); flash(on ? `Auto top-up on. Under ${b!.topup.below} tokens, a ${b!.topup.pack}-token pack is bought for $${b!.topup.price.toFixed(2)}, at most once a day.` : "Auto top-up off. The agent pauses when tokens run out."); load(); }
    catch (x) { flash((x as Error).message, "err"); }
  }
  if (!b) return <p className="hint">Loading…</p>;
  const cur = b.plans[b.plan as keyof typeof b.plans];
  const order = ["free", "carrier", "fleet", "enterprise"] as const;
  return (
    <>
      <Link className="back" href="/app">&larr; Back to Prospects</Link>
      <div className="pane-h"><div><div className="eyebrow">Settings</div><h2>Plan &amp; tokens</h2><p>A flat monthly fee with tokens included, then packs at your plan&rsquo;s rate. A token buys one thing we had to go out and find. Nothing charged when we come back empty-handed.</p></div></div>

      <div className="panel"><h3>{tok(b.total)} available</h3><p className="ph">On {cur.name}{cur.price ? ` · $${cur.price} a month with ${cur.monthly} tokens included` : " · free forever"}. Included tokens are spent first.</p>
        <div className="pools">
          <div><div className="k">Included this month</div><div className="v">{b.monthly}</div><div className="s">{cur.monthly ? `resets to ${cur.monthly} on your billing date` : "Free has no monthly bundle"}</div></div>
          <div><div className="k">Purchased</div><div className="v">{b.extra}</div><div className="s">never expire</div></div>
          <div><div className="k">Spent today</div><div className="v">{b.today}</div><div className="s">{b.cap ? `of a ${b.cap}-token daily cap` : "no daily cap set"}</div></div>
        </div>
        {b.plan !== "free" && b.stripe && <button className="btn-ghost" style={{ marginTop: 12 }} onClick={portal}>Manage subscription</button>}</div>

      <div className="panel"><h3>Your plan</h3><p className="ph">Change any month. Included tokens reset on the billing date. Purchased tokens never expire. Users are unlimited on every plan.</p>
        <div className="plans">{order.map((id) => { const p = b.plans[id]; const isCur = p.id === b.plan; const can = b.stripe && b.buyable[p.id]; return (
          <div className={`plan${isCur ? " rec" : ""}`} key={p.id}>{isCur && <div className="rectag">CURRENT</div>}<div className="nm">{p.name}</div><div className="pr">${p.price}{p.price ? <i>/mo</i> : null}</div>
            <div className="inc">{p.monthly ? `${p.monthly.toLocaleString()} tokens included` : `${b.welcome} tokens to start`}</div><div className="who">{p.who}</div>
            <div className="cta">{isCur ? <button className="btn-ghost" disabled style={{ opacity: .6 }}>Current plan</button>
              : p.id === "free" ? <button className="btn-ghost" onClick={portal} disabled={!b.stripe}>Cancel to Free</button>
              : p.id === "enterprise" && !b.buyable.enterprise ? <a className="btn-ghost" href="mailto:hello@directshipper.co?subject=Enterprise" style={{ display: "block", textAlign: "center" }}>Talk to us</a>
              : <button className={p.id === "carrier" ? "btn" : "btn-ghost"} onClick={() => checkout({ plan: p.id })} disabled={!can || busy}>{p.price > cur.price ? "Upgrade" : "Switch"}</button>}</div>
            <ul>{p.perks.map((t) => <li key={t}>{t}</li>)}{p.off.map((t) => <li key={t} className="off">{t}</li>)}<li>Extra tokens <b>{cents(p.extra)}</b> each</li></ul></div>); })}</div>
        {!b.stripe && <p className="hint">Stripe keys are not set on the server yet, so plan changes are off.</p>}</div>

      <div className="panel"><h3>Extra tokens</h3><p className="ph">Packs at {cents(cur.extra)} a token on {cur.name}, charged once. They never expire and are used after your included tokens.</p>
        <div className="packs">{b.packs.map((p) => <button key={p.tokens} className="pack" onClick={() => checkout({ tokens: p.tokens })} disabled={!b.stripe || busy}><b>{p.tokens} tokens</b><span>${p.price.toFixed(2)}</span></button>)}</div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 16 }}>
          <label style={{ display: "inline-flex", gap: 8, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={b.autoTopup} onChange={(e) => topup(e.target.checked)} disabled={!b.stripe} /><b>Auto top-up</b></label>
          <span className="hint" style={{ margin: 0 }}>Under {b.topup.below} tokens, buy the {b.topup.pack}-token pack for ${b.topup.price.toFixed(2)} on your saved card, at most once a day. Keeps autopilot from stopping on a weekend.{b.card ? "" : " Buy any pack once and the card is kept."}</span>
        </div></div>

      <div className="panel"><h3>Daily cap</h3><p className="ph">A hard ceiling so a big search cannot run away with your month.</p>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", maxWidth: 360 }}><div style={{ flex: 1 }}><label htmlFor="cap">Maximum tokens per day</label><input id="cap" type="text" value={cap} onChange={(e) => setCap(e.target.value)} /></div><button className="btn-ghost" onClick={saveCap}>Save</button></div></div>

      <div className="grid2"><div className="panel"><h3>What a token buys</h3><table className="ratetbl"><tbody>{b.items.map((t) => <tr key={t.what}><td>{t.what}</td><td><b>{t.cost ? tok(t.cost) : t.note || "0 tokens"}</b></td></tr>)}</tbody></table></div>
        <div className="panel"><h3>Never costs a token</h3><table className="ratetbl"><tbody>{b.free.map((t) => <tr key={t}><td>{t}</td><td><span className="pill">FREE</span></td></tr>)}</tbody></table></div></div>

      <div className="panel"><h3>Receipt</h3><table style={{ border: "none" }}><thead><tr><th>When</th><th>What</th><th className="right">Tokens</th><th className="right">Value</th></tr></thead><tbody>
        {b.log.length ? b.log.map((e) => <tr key={e.id} style={{ cursor: "default" }}><td className="log" data-label="When">{new Date(e.createdAt).toLocaleString()}</td><td data-label="What">{e.what}</td><td className="num right" data-label="Tokens">{e.delta > 0 ? "+" : ""}{e.delta || ""}</td><td className="num right usd" data-label="Value">{e.cents ? usd(e.cents) : e.delta > 0 ? "included" : ""}</td></tr>) : <tr style={{ cursor: "default" }}><td colSpan={4} style={{ color: "var(--faint)" }}>No tokens spent yet.</td></tr>}
      </tbody></table></div>
    </>
  );
}
