import Link from "next/link";
export default function Landing() {
  return (
    <div className="view on">
      <div className="topbar"><div className="topbar-in">
        <div className="logo"><b></b>Direct&nbsp;Shipper</div>
        <nav className="topnav">
          <a href="#how">What it does</a>
          <a href="#pricing">Pricing</a>
          <Link className="btn-ghost" href="/signin">Sign in</Link>
          <Link className="btn" href="/signup">Start free</Link>
        </nav>
      </div></div>

      <div className="hero landing-hero"><div className="wrap">
        <h1>You know your trucks. Do you know your freight?</h1>
        <p className="lede">Connect your email and Direct Shipper reads every rate con in it, going back years. You find out what you actually haul, which lanes are quietly underpaying you, and which shippers you can win direct, starting with the docks you already back into every week.</p>
        <div className="hero-cta">
          <Link className="btn btn-lg" href="/signup">Read my freight</Link>
          <a className="btn-ghost btn-lg" href="#pricing">See pricing</a>
        </div>
        <p className="hero-note">Reading your own freight is free, and stays free. No card.</p>
      </div></div>

      <div className="strip"><div className="strip-in">
        <span><i className="dot"></i>Works alongside any TMS, or a spreadsheet</span>
        <span><i className="dot"></i>Every figure shows how many loads it rests on</span>
        <span><i className="dot"></i>Your own data is never shown to anyone else</span>
      </div></div>

      <div className="sect" id="how"><div className="wrap">
        <h2 style={{ maxWidth: "26ch" }}>Stop renting your freight from brokers</h2>
        <p className="sub">Understanding your own freight is free. You pay only when Direct Shipper goes out and finds you someone new.</p>
        <div className="plays">
          {[
            ["01", "Find out what your freight is really worth", "Your whole history read back to you: commodity mix, length of haul, rate per mile by lane. Most carriers discover their busiest lane is their worst paying one.", "FREE", "Unlimited"],
            ["02", "Take the docks you already back into", "You are on their property every week and no broker put you there. Most of them ship outbound too, and that freight is theirs to award.", "FREE", "Contacts cost tokens"],
            ["03", "Win the freight you already know how to haul", "Facilities moving the same commodity on the same lanes you run well, with no broker in between. Your own history does the targeting.", "1 token", "per shipper"],
            ["04", "Work them until they answer", "Seven touches over 30 days, each one written from your own freight history. You approve the opener, the follow-ups send themselves from your domain, and it all stops the second they reply.", "FREE", "Unlimited sends"],
            ["05", "Ask your freight a question", "“Who did I haul frozen for out of Ontario last winter?” Answered from your own rate cons, with the source on every answer.", "FREE", "Unlimited"],
          ].map(([n, h, p, c, s]) => (
            <div className="play" key={n}>
              <div className="pk">Playbook {n}</div><h4>{h}</h4><p>{p}</p>
              <div className="cost"><span className="c">{c === "FREE" ? <span className="tag t-free">FREE</span> : c}</span><span className="n">{s}</span></div>
            </div>
          ))}
        </div>
      </div></div>

      <div className="sect"><div className="wrap">
        <h2>We don&rsquo;t help anyone solicit freight you&rsquo;re under a hold on.</h2>
        <p className="sub">Direct Shipper works outward from what you already have. It never hands you a shipper to call because you hauled it for a broker you still work with.</p>
        <div className="fall" style={{ marginTop: 28 }}>
          <div className="fallcard">
            <h4>What never happens <span>no exceptions</span></h4>
            <ol style={{ counterReset: "none" }}>
              {["Your rates and your broker names are never shown to anyone", "Your customers are never surfaced to another carrier", "No broker ever learns you are a customer here", "Nobody can query anything traceable to your loads", "We never sell your data to a brokerage, a factor, or anyone else"].map((t) => <li key={t} style={{ counterIncrement: "none" }}>{t}</li>)}
            </ol>
            <p className="fallnote">Delete your data any time and it stops counting toward anything, immediately and permanently.</p>
          </div>
          <div className="fallcard">
            <h4>Two ways to grow, warmest first <span>how the matching works</span></h4>
            <ol>
              <li><b>Receivers</b> &mdash; docks you already deliver to, who ship outbound too</li>
              <li><b>Lookalikes</b> &mdash; facilities moving freight like yours, no relationship at all</li>
            </ol>
            <p className="fallnote">Shippers you currently reach through a broker are filtered out of both, and the number excluded is shown on every result.</p>
          </div>
        </div>
      </div></div>

      <div className="sect" id="pricing"><div className="wrap">
        <h2>One token, one answer.</h2>
        <p className="sub">A token buys one thing Direct Shipper had to go out and find: a shipper, a name, an email, a phone number. Nothing else costs tokens, and you are never charged when we come back empty-handed.</p>
        <div className="plans">
          <div className="plan"><div className="nm">Free</div><div className="pr">$0</div><div className="who">Free forever, not a trial</div>
            <div className="cta"><Link className="btn-ghost" href="/signup">Get started free</Link></div>
            <ul><li><b>Inbox connect</b> &mdash; full history scan</li><li>Unlimited rate con parsing</li><li>Your full freight profile</li><li>Receivers you already deliver to</li><li><b>20 tokens</b> to start, then 10 a month</li><li className="off">No extra tokens</li><li className="off">No export or outreach sends</li></ul></div>
          <div className="plan rec"><div className="rectag">MOST CARRIERS</div><div className="nm">Carrier</div><div className="pr">$39<i>/mo</i></div><div className="who">Owner-operators and small fleets</div>
            <div className="cta"><Link className="btn" href="/signup?plan=carrier">Get started</Link></div>
            <ul><li><b>100 tokens</b> a month</li><li><b>Outreach</b> &mdash; email sequences on autopilot</li><li>Export to CSV</li><li>Everything in Free, unlimited</li><li>Unlimited users</li><li>Extra tokens <b>50&cent;</b> each</li></ul></div>
          <div className="plan"><div className="nm">Fleet</div><div className="pr">$149<i>/mo</i></div><div className="who">Fleets with someone selling</div>
            <div className="cta"><Link className="btn-ghost" href="/signup?plan=fleet">Get started</Link></div>
            <ul><li><b>500 tokens</b> a month</li><li>Everything in Carrier</li><li><b>Load history import</b> &mdash; CSV &amp; scheduled report</li><li>Unlimited users</li><li>Extra tokens <b>40&cent;</b> each</li></ul></div>
        </div>
        <p className="hero-note">Connecting your inbox is free on every plan. Monthly tokens roll over for 12 months, extra tokens never expire. Cancel any month.</p>
      </div></div>

      <div className="cta-end"><div className="wrap">
        <h2>Connect your inbox. Keep the margin.</h2>
        <p>Your freight profile is on screen about a minute after you connect. No card, nothing to cancel.</p>
        <div className="g"><Link className="btn btn-lg" href="/signup">Start free</Link></div>
      </div></div>
      <footer><div className="wrap">Direct Shipper &middot; Rates shown are read from your own paperwork. Nothing here is legal advice.</div></footer>
    </div>
  );
}
