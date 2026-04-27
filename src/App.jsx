import { useEffect, useState } from "react";

const scanItems = [
  {
    id: "02",
    text: "Detect recurring charges, fee spikes, and forgotten subscriptions.",
  },
  {
    id: "03",
    text: "Build spending guardrails from real cashflow, not ideal guesses.",
  },
  {
    id: "04",
    text: "Forecast paydays, bills, and goal progress in one clean review.",
  },
];

const navItems = ["Features", "Pricing", "Team", "Contact", "FAQ"];

function CountUpScore({ value }) {
  const [score, setScore] = useState(0);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      setScore(value);
      return undefined;
    }

    let frameId;
    let startTime;
    const delay = 720;
    const duration = 980;
    const timeoutId = window.setTimeout(() => {
      const tick = (timestamp) => {
        if (!startTime) {
          startTime = timestamp;
        }

        const progress = Math.min((timestamp - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setScore(Math.round(eased * value));

        if (progress < 1) {
          frameId = window.requestAnimationFrame(tick);
        }
      };

      frameId = window.requestAnimationFrame(tick);
    }, delay);

    return () => {
      window.clearTimeout(timeoutId);
      window.cancelAnimationFrame(frameId);
    };
  }, [value]);

  return <span>{score}</span>;
}

function App() {
  const [showPreview, setShowPreview] = useState(false);
  const [page, setPage] = useState("home");

  return (
    <main className="shell">
      <section className="screen" aria-label="Talaan budgeting app landing page">
        <header className="topbar">
          <button
            className="brand"
            type="button"
            aria-label="Talaan home"
            onClick={() => {
              setPage("home");
              setShowPreview(false);
            }}
          >
            <span className="brand-mark" />
            <span>talaan</span>
          </button>

          <nav aria-label="Primary navigation">
            {navItems.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setPage(item === "Team" ? "team" : "home");
                  setShowPreview(false);
                }}
              >
                {item}
              </button>
            ))}
          </nav>

          <a className="access-link" href="#signup">
            Get access
          </a>
        </header>

        {page === "team" ? (
          <section className="team-page" aria-label="Talaan team">
            <div className="team-photo-wrap">
              <img
                className="team-photo"
                src="/mark-fordan.jpg"
                alt="Mark Fordan"
              />
            </div>

            <div className="team-copy">
              <span className="team-kicker">Creator / Developer</span>
              <h1>Mark Anthony Fordan</h1>
              <p className="lede">
                Building Talaan as a practical budgeting companion for people
                who want clearer cashflow, cleaner spending habits, and fewer
                money surprises.
              </p>

              <div className="team-links" aria-label="Mark Fordan profile links">
                <a href="https://www.linkedin.com/in/markfordan/" target="_blank" rel="noreferrer">
                  LinkedIn
                </a>
                <a href="https://github.com/akosifords/" target="_blank" rel="noreferrer">
                  GitHub
                </a>
              </div>
            </div>
          </section>
        ) : (
          <div className="hero-stage">
            <section className="intro-panel" aria-label="Talaan introduction">
            <div className="intro-content">
              <h1>TALAAN</h1>
              <p className="lede">
                Your command center for staying ahead of your money.
              </p>

              <div className="scan-list" id="features">
                <div>
                  <span>[01]</span>
                  <p>
                    Scan bills, subscriptions, and spending drift before they break your month.
                  </p>
                </div>
                {scanItems.map((item) => (
                  <div key={item.id}>
                    <span>[{item.id}]</span>
                    <p>{item.text}</p>
                  </div>
                ))}
              </div>

              <div className="cta-row" id="signup">
                <button
                  className="primary-btn"
                  type="button"
                  onClick={() => setShowPreview(true)}
                >
                  Preview
                </button>
                <a className="secondary-btn" href="mailto:hello@talaan.app">
                  Join waitlist
                </a>
              </div>
            </div>
          </section>
          </div>
        )}

        {showPreview && (
          <div
            className="modal-layer"
            role="dialog"
            aria-modal="true"
            aria-label="Budget preview"
          >
            <button
              className="modal-scrim"
              type="button"
              aria-label="Close preview"
              onClick={() => setShowPreview(false)}
            />
            <section className="signal-panel preview-modal" aria-label="Budget health visualization">
              <div className="panel-label finance-badge">BUDGET PREVIEW</div>
              <button
                className="back-btn"
                type="button"
                onClick={() => setShowPreview(false)}
              >
                Back
              </button>
              <div className="health-core" aria-label="Sample budget health score 82">
                <div className="health-score">
                  <CountUpScore value={82} />
                  <small>%</small>
                </div>
                <p>SAMPLE HEALTH</p>
              </div>
              <div className="mini-meters" aria-label="Sample budget preview meters">
                <div className="mini-meter mini-meter-bills">
                  <strong>12</strong>
                  <small>Bills</small>
                </div>
                <div className="mini-meter mini-meter-spend">
                  <strong>74%</strong>
                  <small>Spend</small>
                </div>
                <div className="mini-meter mini-meter-goals">
                  <strong>3</strong>
                  <small>Goals</small>
                </div>
              </div>
              <div className="ticker" aria-label="Budget metrics">
                <span>
                  <strong>+24%</strong>
                  <small>cashflow</small>
                </span>
                <span>
                  <strong>$420</strong>
                  <small>projected spare</small>
                </span>
                <span>
                  <strong>4</strong>
                  <small>subs found</small>
                </span>
                <span>
                  <strong>7d</strong>
                  <small>bill runway</small>
                </span>
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
