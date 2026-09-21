"use client";

import styles from "./AriadnePublicSite.module.css";

const STRATEGY_STAGES = [
  {
    number: "01",
    title: "Direction",
    body: "Define the movement that matters across the major dimensions of life."
  },
  {
    number: "02",
    title: "Strategic Objectives",
    body: "Identify the major changes required to move deliberately in that direction."
  },
  {
    number: "03",
    title: "Execution",
    body: "Express concrete work through projects and tasks without losing its strategic context."
  },
  {
    number: "04",
    title: "Progress",
    body: "Keep execution legible against the strategy it is meant to advance."
  }
];

const PRIORITY_SIGNALS = [
  "Strategic relevance",
  "Urgency",
  "Leverage",
  "Obligations",
  "Actionability"
];

export default function AriadnePublicSite({
  onSignIn,
  isSigningIn = false,
  signInAvailable = true,
  authMessage = "",
  signInLabel: requestedSignInLabel = ""
}) {
  const signInLabel = isSigningIn
    ? "Opening sign in…"
    : !signInAvailable
      ? "Sign In Unavailable"
      : requestedSignInLabel || "Sign In";

  return (
    <div className={styles.site} id="top">
      <header className={styles.header}>
        <a className={styles.productBrand} href="#top" aria-label="Ariadne home">
          <img src="/brand/ariadne-lockup.svg" alt="Ariadne" />
        </a>

        <nav className={styles.nav} aria-label="Ariadne public navigation">
          <a href="#how-it-works">How It Works</a>
          <a href="#strategy">Strategy</a>
          <a href="#opportunities">Opportunities</a>
          <a href="#prioritization">Prioritization</a>
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
            <p className={styles.eyebrow}>Ariadne · Strategy &amp; execution</p>
            <h1 id="ariadne-public-title">Turn direction into action.</h1>
            <p className={styles.heroLede}>
              Ariadne connects long-term direction to strategic objectives, opportunities,
              projects and tasks so the work in front of you stays tied to what actually matters.
            </p>
            <div className={styles.heroActions}>
              <a className={styles.primaryButton} href="#how-it-works">
                Explore Ariadne
              </a>
              <a className={styles.secondaryButton} href="#strategy">
                See the strategy model
              </a>
            </div>
            {authMessage ? <p className={styles.authMessage} role="status">{authMessage}</p> : null}
          </div>

          <StrategyThread />
        </section>

        <section className={styles.problemSection}>
          <div className={styles.sectionHeading}>
            <p className={styles.sectionKicker}>The problem</p>
            <h2>Strategy and execution drift apart.</h2>
            <p>
              Long-term direction often lives in plans or in your head while projects, tasks and
              opportunities compete elsewhere for attention. Ariadne keeps those layers connected
              so urgency does not become the only thing deciding what gets done.
            </p>
          </div>

          <div className={styles.problemFlow} aria-label="Disconnected work becomes a connected action model">
            <div className={styles.problemInputs}>
              <article><span>Direction</span><strong>Where to move</strong></article>
              <article><span>Work</span><strong>What to do</strong></article>
              <article><span>Opportunities</span><strong>What could matter</strong></article>
            </div>
            <span className={styles.flowArrow} aria-hidden="true">↓</span>
            <div className={styles.connectedModel}>
              <img src="/brand/ariadne-mark.svg" alt="" aria-hidden="true" />
              <div>
                <span>Ariadne</span>
                <strong>One connected action model</strong>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section} id="how-it-works">
          <div className={styles.sectionHeading}>
            <p className={styles.sectionKicker}>How it works</p>
            <h2>Direction → objectives → execution → progress.</h2>
            <p>
              Ariadne uses a small strategy hierarchy so abstract direction can remain connected
              to concrete work without turning every task into a strategy object.
            </p>
          </div>

          <div className={styles.stageGrid}>
            {STRATEGY_STAGES.map((stage) => (
              <article className={styles.stageCard} key={stage.number}>
                <span>{stage.number}</span>
                <h3>{stage.title}</h3>
                <p>{stage.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section} id="strategy">
          <div className={styles.strategyGrid}>
            <div>
              <p className={styles.sectionKicker}>Strategy model</p>
              <h2>Keep the why connected to the work.</h2>
              <p className={styles.sectionBody}>
                Directions describe desired movement. Strategic Objectives identify the major
                changes required. Concrete deliverables, deadlines and next actions remain ordinary
                projects and tasks.
              </p>
            </div>

            <div className={styles.strategyModel} aria-label="Ariadne strategy hierarchy">
              <StrategyModelRow label="Vectors" detail="Context" />
              <ModelConnector />
              <StrategyModelRow label="Directions" detail="Desired movement" accent />
              <ModelConnector />
              <StrategyModelRow label="Strategic Objectives" detail="Major required changes" accent />
              <ModelConnector />
              <div className={styles.executionFork}>
                <StrategyModelRow label="Projects" detail="Concrete delivery" compact />
                <StrategyModelRow label="Tasks" detail="Next actions" compact />
              </div>
              <ModelConnector />
              <StrategyModelRow label="Progress Signals" detail="Movement made legible" />
            </div>
          </div>
        </section>

        <section className={styles.section} id="opportunities">
          <div className={styles.sectionHeading}>
            <p className={styles.sectionKicker}>Opportunity Landscape</p>
            <h2>Turn possibilities into deliberate decisions.</h2>
            <p>
              Discovery does not automatically become strategy. Candidates remain separate until
              review promotes them into the curated Opportunity Landscape, where applications can
              be tracked deliberately.
            </p>
          </div>

          <div className={styles.opportunityFlow} aria-label="Ariadne opportunity review flow">
            {[
              ["01", "Discovery", "External or manually supplied candidate"],
              ["02", "Candidate Inbox", "Untrusted possibilities remain separate"],
              ["03", "Review", "Relevance, requirements and provenance are inspected"],
              ["04", "Opportunity Landscape", "Accepted opportunities become canonical"],
              ["05", "Application", "Execution history remains connected to the opportunity"]
            ].map(([number, title, body], index, items) => (
              <div className={styles.opportunityStep} key={number}>
                <article>
                  <span>{number}</span>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
                {index < items.length - 1 ? <span className={styles.stepArrow} aria-hidden="true">→</span> : null}
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section} id="prioritization">
          <div className={styles.priorityGrid}>
            <div>
              <p className={styles.sectionKicker}>Prioritization</p>
              <h2>Priority with context.</h2>
              <p className={styles.sectionBody}>
                Ariadne can reason over a bounded strategy and task surface. Ari Bot uses strategic
                relevance alongside operational signals to support reprioritization without becoming
                an opaque authority over what the user should do.
              </p>

              <div className={styles.signalList} aria-label="Ariadne prioritization signals">
                {PRIORITY_SIGNALS.map((signal, index) => (
                  <span key={signal}>
                    <small>{String(index + 1).padStart(2, "0")}</small>
                    {signal}
                  </span>
                ))}
              </div>
            </div>

            <aside className={styles.priorityPreview} aria-label="Illustrative prioritization model">
              <div className={styles.previewHeader}>
                <span>Illustrative example</span>
                <strong>Bounded prioritization</strong>
              </div>
              <div className={styles.previewTask}>
                <span>Current work</span>
                <strong>Prepare application materials</strong>
              </div>
              <div className={styles.previewFactors}>
                <span><i data-level="high" />Strategic relevance</span>
                <span><i data-level="medium" />Urgency</span>
                <span><i data-level="high" />Leverage</span>
                <span><i data-level="low" />Obligation</span>
              </div>
              <div className={styles.previewResult}>
                <span>Result</span>
                <strong>Higher current priority</strong>
                <p>Recommendation remains inspectable and editable by the user.</p>
              </div>
              <p className={styles.previewNote}>
                Synthetic example only. The public surface never renders private Ariadne data.
              </p>
            </aside>
          </div>
        </section>

        <section className={styles.section} id="fabbro-context">
          <div className={styles.sectionHeading}>
            <p className={styles.sectionKicker}>Fabbro Systems</p>
            <h2>Evidence → state → action.</h2>
            <p>
              Ariadne is the action layer of the current Fabbro Systems family. It can use
              current-state context from Kleos without becoming the canonical store for personal
              measurement or specialist evidence.
            </p>
          </div>

          <div className={styles.familyFlow} aria-label="Fabbro Systems product relationship">
            <a href="https://heracles.fabbrosystems.com/">
              <span>01 · Evidence</span>
              <strong>Heracles</strong>
              <p>Domain evidence and interpretation for resistance training.</p>
            </a>
            <span className={styles.familyArrow} aria-hidden="true">→</span>
            <a href="https://kleos.fabbrosystems.com/">
              <span>02 · State</span>
              <strong>Kleos</strong>
              <p>Evidence-based modelling of the person's current state.</p>
            </a>
            <span className={styles.familyArrow} aria-hidden="true">→</span>
            <a className={styles.currentFamilyStage} href="#top">
              <span>03 · Action</span>
              <strong>Ariadne</strong>
              <p>Strategy, priorities, opportunities, projects, tasks and execution.</p>
            </a>
          </div>
        </section>

        <section className={styles.closingSection}>
          <div>
            <p className={styles.sectionKicker}>Ariadne</p>
            <h2>Turn direction into action.</h2>
          </div>
          <div>
            <p>
              Keep long-term direction connected to the decisions, opportunities and work that
              move it forward.
            </p>
            <small>
              The current deployment is an owner-focused private workspace. The public surface
              explains the system; authentication opens the private application.
            </small>
          </div>
          <button
            className={styles.primaryButton}
            type="button"
            onClick={onSignIn}
            disabled={isSigningIn || !signInAvailable}
          >
            {signInLabel}
          </button>
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

function StrategyThread() {
  const nodes = [
    ["Direction", "Choose the movement that matters"],
    ["Strategic objective", "Define the major required change"],
    ["Projects & tasks", "Convert strategy into executable work"],
    ["Progress", "Keep movement visible"]
  ];

  return (
    <div className={styles.threadVisual} aria-label="Illustrative Ariadne strategy thread">
      <div className={styles.threadHeader}>
        <span>Strategy thread</span>
        <strong>Direction → action</strong>
      </div>
      <div className={styles.threadPath}>
        {nodes.map(([title, body], index) => (
          <div className={styles.threadNode} key={title}>
            <span className={styles.threadIndex}>{String(index + 1).padStart(2, "0")}</span>
            <span className={styles.threadDot} aria-hidden="true" />
            <div>
              <strong>{title}</strong>
              <p>{body}</p>
            </div>
          </div>
        ))}
      </div>
      <p className={styles.threadNote}>A continuous line keeps strategic context attached to execution.</p>
    </div>
  );
}

function StrategyModelRow({ label, detail, accent = false, compact = false }) {
  return (
    <div
      className={`${styles.modelRow}${accent ? ` ${styles.modelRowAccent}` : ""}${compact ? ` ${styles.modelRowCompact}` : ""}`}
    >
      <strong>{label}</strong>
      <span>{detail}</span>
    </div>
  );
}

function ModelConnector() {
  return <span className={styles.modelConnector} aria-hidden="true" />;
}
