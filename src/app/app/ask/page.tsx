"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/components/api";

const EXAMPLES = ["Who did I haul frozen for out of Ontario last winter?", "Which brokers cut my rate on Phoenix this year?", "Who told me to check back in Q1?"];
type Answer = { answer: string; citations: { kind: string; id: string; label: string }[] };

function AskInner() {
  const sp = useSearchParams(); const q = sp.get("q") || "";
  const [a, setA] = useState<Answer | null>(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!q) { setA(null); return; }
    setBusy(true); setErr(""); setA(null);
    api<Answer>("/api/ask", { method: "POST", json: { q } }).then(setA).catch((e) => setErr(e.message)).finally(() => setBusy(false));
  }, [q]);
  return (
    <>
      <Link className="back" href="/app">&larr; Back to Prospects</Link>
      <div className="pane-h"><div><h2>Ask your freight</h2><p>Answered from your own rate cons and emails, with the source on every answer</p></div></div>
      {!q && <div className="panel"><p className="ph">Ask about your own freight in plain words in the box at the top. Every answer links to the rate con or the email it came from. Nothing is made up; when we do not know, we say so.</p>
        <div className="chips">{EXAMPLES.map((e) => <Link key={e} className="chip" href={`/app/ask?q=${encodeURIComponent(e)}`} style={{ height: "auto", padding: "9px 14px", whiteSpace: "normal" }}>{e}</Link>)}</div></div>}
      {q && <div className="ask-q">{q}</div>}
      {busy && <div className="ask-a"><span className="spin" />Reading your loads…</div>}
      {err && <div className="ask-a" style={{ borderLeftColor: "var(--red)" }}>{err}</div>}
      {a && (<>
        <div className="ask-a">{a.answer}</div>
        {a.citations.length > 0 && <div className="ask-c"><h4>Cited <span className="hint" style={{ margin: 0 }}>{a.citations.length} {a.citations.every((c) => c.kind === "load") ? "rate cons" : "sources"}</span></h4>
          {a.citations.map((c) => <Link key={c.id} className="cite" href={c.kind === "load" ? "/app/freight#loads" : "/app/outreach"} style={{ display: "block" }}><b>{c.kind === "load" ? "Rate con" : "Email reply"}</b><span>{c.label}</span><i>{c.kind}:{c.id.slice(0, 8)}</i></Link>)}</div>}
      </>)}
    </>
  );
}
export default function Ask() { return <Suspense fallback={<p className="hint">Loading…</p>}><AskInner /></Suspense>; }
