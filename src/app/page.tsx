import Link from "next/link";
import { PLANS, TOKEN_ITEMS, WELCOME_TOKENS } from "@/lib/plans";
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
        <h1>Your rate cons already know who ships. Now you do.</h1>
        <p className="lede">Connect your inbox or upload your rate cons. Direct Shipper reads every one, lists each shipper and receiver you have hauled for, and shows you the people who run freight at those warehouses, by title, on its own and for free. You pay only when you reveal who they are: a name, an email, a phone number.</p>
        <div className="hero-cta">
          <Link className="btn btn-lg" href="/signup">Show me my shippers</Link>
          <a className="btn-ghost btn-lg" href="#pricing">See pricing</a>
        </div>
        <p className="hero-note">Reading your rate cons and seeing who works at each warehouse is free, and stays free. No card.</p>
      </div></div>

      <div className="strip"><div className="strip-in">
        <span><i className="dot"></i>Every shipper and receiver on your loads, free</span>
        <span><i className="dot"></i>Who books freight at each warehouse, by title, free</span>
        <span><i className="dot"></i>Pay only to reveal a name, email or phone</span>
        <span><i className="dot"></i>Your own data is never shown to anyone else</span>
      </div></div>

      <div className="sect" id="how"><div className="wrap">
        <h2 style={{ maxWidth: "26ch" }}>Stop renting your freight from brokers</h2>
        <p className="sub">Upload rate cons, get shippers. Seeing who they are and who works there is free. You pay only when you reveal a name, an email or a phone number, and never when we come back empty.</p>
        <div className="plays">
          {[
            ["01", "Find out what your freight is really worth", "Your whole history read back to you: commodity mix, length of haul, rate per mile by lane. Most carriers discover their busiest lane is their worst paying one.", "FREE", "Unlimited"],
            ["02", "See who books the freight, before you spend anything", "As the scan fills in, Direct Shipper looks up the transportation, logistics and shipping people at your busiest warehouses on its own. You see how many there are and their titles for free. Revealing one is a token; the email is verified before it is sent and a bounce is refunded.", "FREE", "Titles free, 1 token to reveal"],
            ["03", "Win the freight you already know how to haul", "Facilities moving the same commodity on the same lanes you run well, with no broker in between. Your own history does the targeting.", "1 token", "per new shipper"],
            ["04", "Let the agent work them until they answer", "Seven touches over 30 days, each one written from your own freight history and signed by you, from the company you choose. On Send, the agent starts new shippers every day on its own, never one you are under a hold on, and stops the second they reply.", "FREE", "Sends included on paid plans"],
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
              <li><b>Receivers</b> &mdash; warehouses you already deliver to, who ship outbound too</li>
              <li><b>Lookalikes</b> &mdash; facilities moving freight like yours, no relationship at all</li>
            </ol>
            <p className="fallnote">Shippers you currently reach through a broker are filtered out of both, and the number excluded is shown on every result.</p>
          </div>
        </div>
      </div></div>

      <div className="sect" id="pricing"><div className="wrap">
        <h2>A flat fee, tokens included.</h2>
        <p className="sub">Reading your own freight is free, and stays free. A paid plan turns the sales agent on and includes a monthly bundle of tokens. A token buys one thing Direct Shipper had to go out and find: who someone is, their email, their phone, a new shipper. Never charged when we come back empty-handed. Need more? Packs at your plan&rsquo;s rate, and they never expire.</p>
        <div className="plans">
          {([
            ["free", "Get started free", "/signup", false],
            ["carrier", "Start on Carrier", "/signup?plan=carrier", true],
            ["fleet", "Start on Fleet", "/signup?plan=fleet", false],
            ["enterprise", "Start on Enterprise", "/signup?plan=enterprise", false],
          ] as const).map(([id, cta, href, rec]) => { const p = PLANS[id]; return (
            <div className={`plan${rec ? " rec" : ""}`} key={id}>{rec && <div className="rectag">MOST CARRIERS</div>}
              <div className="nm">{p.name}</div><div className="pr">{id === "enterprise" ? <><i>from </i>${p.price}</> : `$${p.price}`}{p.price ? <i>/mo</i> : null}</div>
              <div className="inc">{p.monthly ? `${p.monthly.toLocaleString()} tokens included` : `${WELCOME_TOKENS} tokens to start`}</div><div className="who">{p.who}</div>
              <div className="cta"><Link className={rec ? "btn" : "btn-ghost"} href={href}>{cta}</Link></div>
              <ul>{p.perks.map((t) => <li key={t}>{t}</li>)}{p.off.map((t) => <li key={t} className="off">{t}</li>)}<li>Extra tokens <b>{Math.round(p.extra * 100)}&cent;</b> each</li></ul>
            </div>); })}
        </div>
        <div className="fall" style={{ marginTop: 28 }}>
          <div className="fallcard">
            <h4>What a token buys <span>only data, never AI</span></h4>
            <ol>{TOKEN_ITEMS.map((t) => <li key={t.what}><b>{t.cost ? `${t.cost} token${t.cost === 1 ? "" : "s"}` : "0 tokens"}</b> &mdash; {t.what}{t.note ? `, ${t.note}` : ""}</li>)}</ol>
            <p className="fallnote">Reading rate cons, writing sequences, every email sent, and asking your freight a question never cost a token, on any plan.</p>
          </div>
          <div className="fallcard">
            <h4>How the bundle works <span>like a phone plan</span></h4>
            <ol>
              <li><b>Included tokens</b> are spent first and reset on your billing date</li>
              <li><b>Packs</b> of 50, 200 or 1,000 at your plan&rsquo;s rate, charged once, never expire</li>
              <li><b>Auto top-up</b>, if you switch it on, buys a 50-token pack when you run low so the agent never stops on a weekend</li>
            </ol>
            <p className="fallnote">Each plan&rsquo;s bundle covers its autopilot for the month. Most carriers never buy a pack.</p>
          </div>
        </div>
        <p className="hero-note">Connecting your inbox is free on every plan. Cancel any month; purchased tokens stay yours.</p>
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
