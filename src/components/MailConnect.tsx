"use client";
import { useState } from "react";
import { api } from "./api";
import { useFlash } from "./Flash";

/* Connect Gmail (app password), Outlook (OAuth), upload, or forward.
   Used on onboarding and again under Sources. */
export function MailConnect({ me, onDone, compact }: { me: { forwardAddress: string; features: { microsoft: boolean; ai: boolean } } | null; onDone?: () => void; compact?: boolean }) {
  const { flash } = useFlash();
  const [addr, setAddr] = useState(""); const [pw, setPw] = useState(""); const [who, setWho] = useState(""); const [busy, setBusy] = useState<string | null>(null);
  const [showFallback, setShowFallback] = useState(false);

  async function gmail(e: React.FormEvent) {
    e.preventDefault(); setBusy("gmail");
    try {
      const r = await api<{ first: { stored: number; skipped: number; errors: string[] } }>("/api/mail/gmail", { method: "POST", json: { address: addr, appPassword: pw, senderName: who } });
      flash(r.first.errors.length && !r.first.stored
        ? `Connected, but reading failed: ${r.first.errors[0]}`
        : `Connected. First pass read ${r.first.stored} rate con${r.first.stored === 1 ? "" : "s"}. The rest of your history reads in the background, about 360 messages an hour; watch progress under Account → Sources.`, r.first.errors.length && !r.first.stored ? "err" : "ok");
      onDone?.();
    } catch (x) { flash((x as Error).message, "err"); } finally { setBusy(null); }
  }
  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files; if (!files?.length) return;
    setBusy("upload");
    const fd = new FormData(); Array.from(files).forEach((f) => fd.append("files", f));
    try {
      const r = await api<{ stored: number; skipped: number; errors: string[] }>("/api/mail/upload", { method: "POST", body: fd });
      flash(`${r.stored} rate con${r.stored === 1 ? "" : "s"} read${r.skipped ? `, ${r.skipped} skipped as not a rate con` : ""}${r.errors.length ? `, ${r.errors.length} failed: ${r.errors[0]}` : ""}`, r.stored ? "ok" : "err");
      onDone?.();
    } catch (x) { flash((x as Error).message, "err"); } finally { setBusy(null); e.target.value = ""; }
  }
  const copy = () => { navigator.clipboard?.writeText(me?.forwardAddress || ""); flash("Copied. Add a filter in Gmail or Outlook that forwards broker mail to it."); };

  return (
    <>
      {!me?.features.ai && <div className="cbox warn" style={{ marginBottom: 18 }}><h4>The reader is off</h4><p style={{ margin: 0 }}>ANTHROPIC_API_KEY is not set on the server, so rate cons cannot be read yet. Connecting still works; parsing starts once the key is added.</p></div>}
      <div className="panel" style={{ borderLeft: "3px solid var(--blue)" }}>
        <h3>Connect Gmail</h3>
        <p className="ph">Gmail lets a trusted app read and send mail with an <b>App Password</b>. No Google review, nothing to install. It takes about two minutes:</p>
        <ol className="steps-ol">
          <li>Open <code>myaccount.google.com/security</code> and turn on <b>2-Step Verification</b> if it is off.</li>
          <li>Open <code>myaccount.google.com/apppasswords</code>, name it <code>Direct Shipper</code>, and click Create.</li>
          <li>Copy the 16-character password Google shows you and paste it below. Spaces do not matter.</li>
        </ol>
        <form onSubmit={gmail} className="grid2" style={{ gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
          <div className="formrow"><label htmlFor="g-addr">Gmail address</label><input id="g-addr" type="email" value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="dispatch@yourcompany.com" required /></div>
          <div className="formrow"><label htmlFor="g-pw">App password</label><input id="g-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="xxxx xxxx xxxx xxxx" required /></div>
          <div className="formrow" style={{ gridColumn: "1 / -1" }}><label htmlFor="g-who">Sign outreach from this mailbox as</label><input id="g-who" type="text" value={who} onChange={(e) => setWho(e.target.value)} placeholder="Justin Ruiz, owner" /><p className="hint">Connect a second mailbox for a dispatcher or salesperson and pick who sends per dock.</p></div>
          <div style={{ gridColumn: "1 / -1" }}><button className="btn btn-lg" disabled={busy === "gmail"}>{busy === "gmail" ? <><span className="spin" />Checking the login and reading your first rate cons…</> : "Connect Gmail"}</button></div>
        </form>
        <p className="hint">Works with Google Workspace too, as long as 2-Step Verification is on. Your first rate cons show within a minute; the full history reads in the background at about 360 messages an hour. Disconnect any time under Account &rarr; Sources, or revoke the app password from the same Google page.</p>
      </div>

      {me?.features.microsoft && (
        <div className="panel">
          <h3>Connect Outlook</h3>
          <p className="ph">Outlook and Microsoft 365 sign in with Microsoft. Read-only mail access plus permission to send as you.</p>
          <a className="btn-ghost" href="/api/mail/microsoft/start">Sign in with Microsoft</a>
        </div>
      )}

      {compact || showFallback ? (
        <>
          <div className="panel">
            <h3>Upload rate cons</h3>
            <p className="ph">Drop in PDFs. Good for a quick look before you connect anything, or for paper you scanned.</p>
            <label className="btn-ghost" style={{ display: "inline-block", cursor: "pointer" }}>{busy === "upload" ? <><span className="spin" />Reading…</> : "Choose PDF files"}<input type="file" accept="application/pdf" multiple hidden onChange={upload} disabled={busy === "upload"} /></label>
          </div>
          <div className="panel" style={{ marginBottom: 0 }}>
            <h3>Forward instead</h3>
            <p className="ph">Set one filter in your mail, or point your TMS&rsquo;s scheduled load report at this address. Rate cons sent here are read within a minute.</p>
            <div className="field"><div className="copybox">{me?.forwardAddress || "…"}</div><button className="btn-ghost" onClick={copy} type="button">Copy</button></div>
          </div>
        </>
      ) : (
        <details className="fold" onToggle={(e) => setShowFallback((e.target as HTMLDetailsElement).open)}>
          <summary><span className="hint" style={{ margin: 0 }}>Can&rsquo;t connect an inbox? Two other ways in</span></summary>
        </details>
      )}
    </>
  );
}
