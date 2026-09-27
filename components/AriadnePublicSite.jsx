"use client";

import { useEffect, useRef, useState } from "react";
import { Compass, GitBranch, HardDrive, Lock } from "lucide-react";
import LabyrinthThread from "./public-site/LabyrinthThread";
import OpportunityDemo from "./public-site/OpportunityDemo";
import PriorityDemo, { PRIORITY_SIGNALS } from "./public-site/PriorityDemo";
import SignalsDemo from "./public-site/SignalsDemo";
import StrategyExplorer from "./public-site/StrategyExplorer";
import StrategyLayers from "./public-site/StrategyLayers";
import TangleToThread from "./public-site/TangleToThread";
import WorkspacePreview from "./public-site/WorkspacePreview";
import { useInView } from "./public-site/useInView";
import styles from "./AriadnePublicSite.module.css";

const RAIL_SECTIONS = [
  ["workspace", "Workspace"],
  ["problem", "The problem"],
  ["how-it-works", "How it works"],
  ["strategy", "Strategy"],
  ["prioritization", "Prioritization"],
  ["opportunities", "Opportunities"],
  ["signals", "Signals"]
];

const PRINCIPLES = [
  {
    icon: HardDrive,
    title: "Local-first",
    body: "Opens instantly and keeps working offline. Changes sync safely in the background when the cloud is available."
  },
  {
    icon: Lock,
    title: "Private by default",
    body: "Your strategy is yours. Private data never renders on a public surface and is cleared when access is revoked."
  },
  {
    icon: GitBranch,
    title: "GitHub-native",
    body: "Repositories and issues sync through a GitHub App, so shipped work shows up as progress on its own."
  },
  {
    icon: Compass,
    title: "Your judgment, in charge",
    body: "Recommendations are inspectable and editable. Ariadne supports decisions; it never takes them from you."
  }
];

const HERO_POINTS = [
  "Several directions at once",
  "Priority with reasons",
  "Progress without reporting"
];

export default function AriadnePublicSite({
  onSignIn,
  isSigningIn = false,
  signInAvailable = true,
  authMessage = "",
  signInLabel: requestedSignInLabel = ""
}) {
  const siteRef = useRef(null);
  const [closingRef, closingInView] = useInView({ threshold: 0.3 });
  const signInLabel = isSigningIn
    ? "Opening sign in…"
    : !signInAvailable
      ? "Sign In Unavailable"
      : requestedSignInLabel || "Sign In";

  useReveal(siteRef);

  return (
    <div className={styles.site} id="top" ref={siteRef} data-public-scroll>
      <ThreadRail scrollRef={siteRef} />

      <header className={styles.header}>
        <a className={styles.productBrand} href="#top" aria-label="Ariadne home">
          <img src="/brand/ariadne-lockup.svg" alt="Ariadne" />
        </a>

        <nav className={styles.nav} aria-label="Ariadne public navigation">
          <a href="#how-it-works">How It Works</a>
          <a href="#strategy">Strategy</a>
          <a href="#prioritization">Prioritization</a>
          <a href="#opportunities">Opportunities</a>
          <a href="#signals">Signals</a>
        </nav>

        <button
          className={styles.signIn}
          type="button"
          onClick={onSignIn}
          disabled={isSigningIn || !signInAvailable}
        >
          {signInLabel}
        </button>
      </header>

      <main>
        <section className={styles.hero} aria-labelledby="ariadne-public-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Ariadne · Personal strategy &amp; execution</p>
            <h1 id="ariadne-public-title">Turn direction into action.</h1>
            <p className={styles.heroLede}>
              The thread between where you&rsquo;re going and what you do today.
            </p>
            <div className={styles.heroActions}>
              <a className={styles.primaryButton} href="#workspace">
                See it in action
              </a>
              <a className={styles.secondaryButton} href="#how-it-works">
                How it works
              </a>
            </div>
            <ul className={styles.heroPoints}>
              {HERO_POINTS.map((point) => <li key={point}>{point}</li>)}
            </ul>
            {authMessage ? <p className={styles.authMessage} role="status">{authMessage}</p> : null}
          </div>

          <div className={styles.heroVisual}>
            <LabyrinthThread />
          </div>
        </section>

        <section className={styles.section} id="workspace" aria-labelledby="workspace-title">
          <SectionHeading
            id="workspace-title"
            kicker="The workspace"
            title="Your whole strategy on one calm screen."
            body="Where you stand, where you're heading, and what needs attention right now — the dashboard answers all three at a glance, without a separate reporting system."
          />
          <WorkspacePreview />
        </section>

        <section className={styles.section} id="problem" aria-labelledby="problem-title">
          <SectionHeading
            id="problem-title"
            kicker="The problem"
            title="Busy is not the same as moving."
            body="Long-term direction lives in your head while tasks, projects and opportunities compete for attention elsewhere. Urgency wins by default. Ariadne hangs every piece of work from a thread back to why it matters — and makes work without a thread impossible to miss."
          />
          <TangleToThread />
        </section>

        <section className={styles.section} id="how-it-works" aria-labelledby="how-title">
          <SectionHeading
            id="how-title"
            kicker="How it works"
            title="Five layers. One unbroken thread."
            body="A deliberately small hierarchy keeps abstract direction connected to concrete work — without turning every task into a strategy object."
          />
          <StrategyLayers />
        </section>

        <section className={styles.section} id="strategy" aria-labelledby="strategy-title">
          <SectionHeading
            id="strategy-title"
            kicker="Strategy model"
            title="Pull any thread."
            body="Pick a direction to see everything it drives, or a task to see exactly why it matters. Every link is explicit, so the why never gets lost behind the what."
          />
          <StrategyExplorer />
        </section>

        <section className={styles.section} id="prioritization" aria-labelledby="priority-title">
          <div className={styles.split}>
            <div className={styles.splitCopy} data-reveal>
              <p className={styles.sectionKicker}>Prioritization</p>
              <h2 id="priority-title">Priority with context.</h2>
              <p className={styles.sectionBody}>
                Ari Bot reads your enabled directions, active objectives and open tasks, then weighs
                each task on five signals. It proposes a single 0–4 priority — and shows its reasons.
              </p>
              <ol className={styles.signalList} aria-label="Ariadne prioritization signals">
                {PRIORITY_SIGNALS.map(([key, label], index) => (
                  <li key={key} data-signal={key}>
                    <small>{String(index + 1).padStart(2, "0")}</small>
                    {label}
                  </li>
                ))}
              </ol>
              <p className={styles.fineprint}>
                Synthetic example only. The public surface never renders private Ariadne data.
              </p>
            </div>
            <PriorityDemo />
          </div>
        </section>

        <section className={styles.section} id="opportunities" aria-labelledby="opportunities-title">
          <SectionHeading
            id="opportunities-title"
            kicker="Opportunity Landscape"
            title="Turn possibilities into deliberate decisions."
            body="Discovery fills an inbox, not your plans. Candidates are reviewed against real requirements, and only what earns it is promoted to a curated Landscape — mapped by strategic value and how attainable it really is."
          />
          <OpportunityDemo />
        </section>

        <section className={styles.section} id="signals" aria-labelledby="signals-title">
          <SectionHeading
            id="signals-title"
            kicker="Progress signals"
            title="Know when work stalls, before it matters."
            body="Ariadne watches repositories, publications and deadlines, and raises a notice when something goes quiet. Progress stays visible without a weekly reporting ritual."
          />
          <SignalsDemo />
        </section>

        <section className={styles.section} id="principles" aria-labelledby="principles-title">
          <SectionHeading
            id="principles-title"
            kicker="Built to be trusted"
            title="Fast, private, and firmly yours."
          />
          <div className={styles.principles}>
            {PRINCIPLES.map(({ icon: Icon, title, body }, index) => (
              <article key={title} data-reveal style={{ "--reveal-delay": `${index * 90}ms` }}>
                <span className={styles.principleIcon}><Icon size={20} strokeWidth={1.8} /></span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section} id="fabbro-context" aria-labelledby="family-title">
          <SectionHeading
            id="family-title"
            kicker="Fabbro Systems"
            title="Evidence → state → action."
            body="Ariadne is the action layer of the Fabbro Systems family. It can read current-state context from Kleos without becoming the store for personal measurement or specialist evidence."
          />
          <div className={styles.familyFlow} aria-label="Fabbro Systems product relationship">
            <a href="https://heracles.fabbrosystems.com/" data-product="heracles" data-reveal>
              <span>01 · Evidence</span>
              <strong>Heracles</strong>
              <p>Domain evidence and interpretation for resistance training.</p>
            </a>
            <a href="https://kleos.fabbrosystems.com/" data-product="kleos" data-reveal style={{ "--reveal-delay": "120ms" }}>
              <span>02 · State</span>
              <strong>Kleos</strong>
              <p>Evidence-based modelling of a person&rsquo;s current state.</p>
            </a>
            <a className={styles.currentFamilyStage} href="#top" data-product="ariadne" data-reveal style={{ "--reveal-delay": "240ms" }}>
              <span>03 · Action</span>
              <strong>Ariadne</strong>
              <p>Strategy, priorities, opportunities, projects, tasks and execution.</p>
            </a>
          </div>
        </section>

        <section className={styles.closingSection} id="start" ref={closingRef} aria-labelledby="closing-title">
          <div className={styles.closingCopy}>
            <p className={styles.sectionKicker}>Ariadne</p>
            <h2 id="closing-title">Find your thread.</h2>
            <p>
              Keep long-term direction connected to the decisions, opportunities and work that move
              it forward — every single day.
            </p>
            <div className={styles.heroActions}>
              <button
                className={styles.primaryButton}
                type="button"
                onClick={onSignIn}
                disabled={isSigningIn || !signInAvailable}
              >
                {signInLabel}
              </button>
              <a className={styles.secondaryButton} href="#top">Back to top</a>
            </div>
            <small>
              Ariadne is currently a private workspace; signing in opens the application for
              authorized accounts. Every example on this page is synthetic.
            </small>
          </div>
          <div className={styles.closingVisual}>
            <LabyrinthThread start={closingInView} />
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerIdentities}>
          <a href="#top" aria-label="Ariadne home">
            <img className={styles.footerProduct} src="/brand/ariadne-lockup.svg" alt="Ariadne" />
          </a>
          <a
            className={styles.fabbroEndorsement}
            href="https://fabbrosystems.com/"
            aria-label="Fabbro Systems"
          >
            <img src="/brand/fabbro-mark.svg" alt="" aria-hidden="true" />
            <span>Fabbro Systems</span>
          </a>
        </div>

        <nav className={styles.footerNav} aria-label="Footer navigation">
          <a href="#strategy">Strategy</a>
          <a href="#opportunities">Opportunities</a>
          <a href="https://github.com/NeoLorenzo/Ariadne">GitHub</a>
          <a href="https://fabbrosystems.com/">Fabbro Systems</a>
        </nav>
      </footer>
    </div>
  );
}

function SectionHeading({ id, kicker, title, body }) {
  return (
    <div className={styles.sectionHeading} data-reveal>
      <p className={styles.sectionKicker}>{kicker}</p>
      <h2 id={id}>{title}</h2>
      {body ? <p className={styles.sectionBody}>{body}</p> : null}
    </div>
  );
}

// Adds a one-time entrance to headings and cards. Content stays visible when
// scripting or IntersectionObserver is unavailable.
function useReveal(siteRef) {
  useEffect(() => {
    const site = siteRef.current;
    if (!site || typeof IntersectionObserver === "undefined") return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;

    const targets = Array.from(site.querySelectorAll("[data-reveal]"));
    const viewport = window.innerHeight || 0;
    targets.forEach((target) => {
      if (target.getBoundingClientRect().top < viewport) target.dataset.visible = "true";
    });
    site.dataset.motion = "ready";

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.dataset.visible = "true";
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });
    targets.filter((target) => !target.dataset.visible).forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, [siteRef]);
}

function ThreadRail({ scrollRef }) {
  const [state, setState] = useState({ progress: 0, active: -1, marks: [], visible: false });

  useEffect(() => {
    const site = scrollRef.current;
    if (!site) return undefined;
    let frame = 0;

    const update = () => {
      frame = 0;
      const max = Math.max(site.scrollHeight - site.clientHeight, 1);
      const progress = Math.min(site.scrollTop / max, 1);
      const probe = site.scrollTop + site.clientHeight * 0.4;
      let active = -1;
      const marks = RAIL_SECTIONS.map(([id], index) => {
        const section = document.getElementById(id);
        const top = section ? section.offsetTop : 0;
        if (section && top <= probe) active = index;
        return Math.min(Math.max((top - site.clientHeight * 0.4) / max, 0), 1);
      });
      setState({ progress, active, marks, visible: site.scrollTop > site.clientHeight * 0.5 });
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    site.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      site.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scrollRef]);

  return (
    <nav
      className={styles.rail}
      data-visible={state.visible ? "true" : undefined}
      aria-label="Page progress"
    >
      <span className={styles.railTrack} aria-hidden="true">
        <span style={{ transform: `scaleY(${state.progress})` }} />
      </span>
      {RAIL_SECTIONS.map(([id, label], index) => (
        <a
          key={id}
          href={`#${id}`}
          className={styles.railMark}
          data-state={index < state.active ? "passed" : index === state.active ? "active" : undefined}
          style={{ top: `${(state.marks[index] ?? index / RAIL_SECTIONS.length) * 100}%` }}
          tabIndex={state.visible ? 0 : -1}
        >
          <span>{label}</span>
        </a>
      ))}
    </nav>
  );
}
