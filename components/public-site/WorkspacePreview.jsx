"use client";

import { useEffect, useRef, useState } from "react";
import { BriefcaseBusiness, LayoutDashboard, ListTodo, PanelLeft } from "lucide-react";
import { CURRENT_POSITION, DIRECTIONS, NOTICES, REPOSITORIES } from "./syntheticWorkspace";
import { prefersReducedMotion, useInView } from "./useInView";
import styles from "./WorkspacePreview.module.css";

const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 780;

const HOTSPOTS = [
  {
    id: "position",
    title: "Current position",
    body: "Eight life vectors, read from Kleos, show where you stand today — kept separate from where you intend to go.",
    x: 884,
    y: 200
  },
  {
    id: "directions",
    title: "Concurrent directions",
    body: "Several directions stay active at once. No single global goal flattens the rest of your life.",
    x: 884,
    y: 505
  },
  {
    id: "signals",
    title: "Signals that need you",
    body: "Stalled repositories, silent publications and closing deadlines surface automatically.",
    x: 1238,
    y: 200
  }
];

export default function WorkspacePreview() {
  const frameRef = useRef(null);
  const shellRef = useRef(null);
  const [scale, setScale] = useState(0);
  const [activeHotspot, setActiveHotspot] = useState("");
  const [viewRef, inView] = useInView({ threshold: 0.15 });

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return undefined;
    const update = () => setScale(shell.clientWidth / DESIGN_WIDTH);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || prefersReducedMotion()) return undefined;
    const scroller = frame.closest("[data-public-scroll]") || window;
    let raf = 0;

    const update = () => {
      raf = 0;
      const rect = frame.getBoundingClientRect();
      const viewport = window.innerHeight || 1;
      const progress = Math.min(Math.max((viewport - rect.top) / (viewport * 0.75), 0), 1);
      frame.style.setProperty("--reveal", progress.toFixed(3));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className={styles.wrapper} ref={viewRef}>
      <div className={styles.perspective}>
        <div className={styles.frame} ref={frameRef} style={{ "--reveal": 1 }}>
          <div className={styles.chrome} aria-hidden="true">
            <span className={styles.dots}><i /><i /><i /></span>
            <span className={styles.url}>ariadne.fabbrosystems.com</span>
            <span className={styles.chromeSpacer} />
          </div>
          <div
            className={styles.shell}
            ref={shellRef}
            style={{ height: scale ? DESIGN_HEIGHT * scale : undefined, aspectRatio: scale ? undefined : `${DESIGN_WIDTH} / ${DESIGN_HEIGHT}` }}
          >
            <div
              className={`${styles.app}${inView ? ` ${styles.live}` : ""}`}
              style={{ transform: `scale(${scale || 1})`, visibility: scale ? "visible" : "hidden", "--app-scale": Math.max(scale, 0.45) || 1 }}
              data-active-hotspot={activeHotspot || undefined}
              aria-hidden="true"
            >
              <MockSidebar />
              <div className={styles.workspace}>
                <div className={styles.utility}>
                  <span className={styles.iconButton}><PanelLeft size={16} /></span>
                  <strong>Dashboard</strong>
                  <span className={styles.utilitySpacer} />
                  <img src="/brand/fabbro-mark.svg" alt="" className={styles.familyMark} />
                  <span className={styles.utilityDivider} />
                  <span className={styles.signOut}>Sign Out</span>
                </div>
                <MockDashboard />
              </div>

              {HOTSPOTS.map((hotspot, index) => (
                <span
                  key={hotspot.id}
                  className={`${styles.hotspot}${activeHotspot === hotspot.id ? ` ${styles.hotspotActive}` : ""}`}
                  style={{ left: hotspot.x, top: hotspot.y }}
                >
                  {index + 1}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <ol className={styles.legend} aria-label="What the Ariadne dashboard shows">
        {HOTSPOTS.map((hotspot, index) => (
          <li key={hotspot.id}>
            <button
              type="button"
              className={activeHotspot === hotspot.id ? styles.legendActive : undefined}
              onMouseEnter={() => setActiveHotspot(hotspot.id)}
              onMouseLeave={() => setActiveHotspot("")}
              onFocus={() => setActiveHotspot(hotspot.id)}
              onBlur={() => setActiveHotspot("")}
              onClick={() => setActiveHotspot((current) => (current === hotspot.id ? "" : hotspot.id))}
              aria-pressed={activeHotspot === hotspot.id}
            >
              <span className={styles.legendIndex}>{index + 1}</span>
              <span>
                <strong>{hotspot.title}</strong>
                <span>{hotspot.body}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function MockSidebar() {
  const items = [
    { label: "Dashboard", icon: LayoutDashboard, active: true },
    { label: "Tasks", icon: ListTodo },
    { label: "Opportunities", icon: BriefcaseBusiness }
  ];
  return (
    <aside className={styles.sidebar}>
      <img src="/brand/ariadne-lockup.svg" alt="" className={styles.sidebarLockup} />
      <span className={styles.sidebarGroup}>Direction &amp; execution</span>
      {items.map(({ label, icon: Icon, active }) => (
        <span key={label} className={`${styles.sidebarItem}${active ? ` ${styles.sidebarItemActive}` : ""}`}>
          <Icon size={17} strokeWidth={1.8} />
          {label}
        </span>
      ))}
    </aside>
  );
}

function MockDashboard() {
  return (
    <div className={styles.dashboard}>
      <span className={styles.kicker}>Monday, October 12</span>
      <h3 className={styles.pageTitle}>Dashboard</h3>
      <p className={styles.pageLede}>Current position, active direction, and the signals that need attention.</p>

      <div className={styles.columns}>
        <div className={styles.mainColumn}>
          <section className={styles.card} data-region="position">
            <header className={styles.cardHeader}>
              <div>
                <strong>Current position</strong>
                <span>Kleos assessment · Oct 5</span>
              </div>
              <span className={styles.ghostButton}>Manage strategy</span>
            </header>
            <div className={styles.vectorGrid}>
              {CURRENT_POSITION.map((item, index) => (
                <div key={item.vector} className={styles.vectorCell}>
                  <div className={styles.vectorTop}>
                    <span>{item.vector}</span>
                    <strong className={item.score === null ? styles.unknown : undefined}>
                      {item.score === null ? "Unknown" : item.score}
                    </strong>
                  </div>
                  <div className={styles.vectorBar}>
                    <span style={{ "--score": `${item.score ?? 0}%`, "--delay": `${index * 70}ms` }} />
                  </div>
                  <div className={styles.vectorMeta}>
                    <span>{item.confidence.replace(" confidence", "")}</span>
                    <span className={item.directions ? styles.covered : undefined}>
                      {item.directions} direction{item.directions === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section data-region="directions">
            <div className={styles.sectionRow}>
              <strong>Active directions</strong>
              <span className={styles.count}>{DIRECTIONS.length}</span>
            </div>
            <div className={styles.directionGrid}>
              {DIRECTIONS.map((direction, index) => (
                <article key={direction.id} className={styles.directionCard}>
                  <span className={styles.directionIndex}>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{direction.title}</strong>
                  <p>{direction.statement}</p>
                  <div className={styles.pills}>
                    {direction.vectors.map((vector) => <span key={vector}>{vector}</span>)}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>

        <div className={styles.sideColumn}>
          <section className={styles.card} data-region="signals">
            <header className={styles.cardHeader}>
              <div>
                <strong>Notice board</strong>
                <span>{NOTICES.length} issues</span>
              </div>
            </header>
            <div className={styles.notices}>
              {NOTICES.map((notice) => (
                <div key={notice.text} className={styles.notice} data-level={notice.level}>
                  <span>{notice.label}</span>
                  <p>{notice.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.card}>
            <header className={styles.cardHeader}>
              <div>
                <strong>Repositories</strong>
                <span>{REPOSITORIES.length} synced from GitHub</span>
              </div>
            </header>
            <div className={styles.repos}>
              {REPOSITORIES.map((repo) => (
                <div key={repo.name} className={styles.repo} data-state={repo.state}>
                  <span>{repo.name}</span>
                  <strong>{repo.committed}</strong>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
