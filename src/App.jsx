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

const pricingPlans = [
  {
    name: "Free",
    price: "$0",
    note: "No credit card required",
    cta: "Join Waitlist",
    features: [
      "Real-time transaction scanning",
      "Subscription detection",
      "Cashflow forecasting",
      "Budget guardrails",
      "Goal tracking",
      "Financial health score",
      "All future features",
    ],
  },
  {
    name: "Supporter",
    price: "Pay What You Want",
    textPrice: true,
    note: "Optional donation",
    cta: "Donate",
    features: [
      "Everything in Free",
      "Support indie development",
      "Help us stay ad-free",
      "Supporter badge (optional)",
      "Early feature previews",
      "Priority support",
      "Warm fuzzy feelings",
    ],
    featured: true,
  },
];

const commonQuestions = [
  {
    id: "01",
    question: "Why is Talaan free?",
    answer:
      "Everyone deserves access to financial clarity, regardless of income. Money management tools should not be a luxury.",
  },
  {
    id: "02",
    question: "Will it stay free forever?",
    answer:
      "Yes. Core features will always be free. Talaan is funded by optional supporter donations from people who believe in the mission.",
  },
  {
    id: "03",
    question: "What happens with donations?",
    answer:
      "Donations go directly to development, hosting, and keeping Talaan running. No ads, no data selling, no hidden costs.",
  },
  {
    id: "04",
    question: "Do I get more features if I donate?",
    answer:
      "No. Donations are purely optional support. Everyone gets the same powerful core features whether they donate or not.",
  },
];

const otherWaysToConnect = [
  {
    id: "01",
    title: "Documentation",
    description: "Check our guides and tutorials.",
    href: "mailto:hello@talaan.app?subject=Documentation",
    cta: "View Docs",
  },
  {
    id: "02",
    title: "Community",
    description: "Join our updates and product discussions.",
    href: "mailto:hello@talaan.app?subject=Community",
    cta: "Join Community",
  },
  {
    id: "03",
    title: "FAQ",
    description: "Get quick answers about Talaan.",
    href: "mailto:hello@talaan.app?subject=FAQ",
    cta: "Read FAQ",
  },
];

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
                  setPage(
                    item === "Team"
                      ? "team"
                      : item === "Pricing"
                        ? "pricing"
                        : item === "Contact"
                          ? "contact"
                          : "home",
                  );
                  setShowPreview(false);
                }}
              >
                {item}
              </button>
            ))}
          </nav>
        </header>

        {page === "pricing" ? (
          <section className="pricing-page" aria-label="Talaan pricing">
            <div className="pricing-heading">
              <h1>Free. Forever.</h1>
              <p className="lede">
                Financial clarity should not cost you. Talaan is free for everyone, with
                optional support for those who want to help us grow.
              </p>
            </div>

            <div className="pricing-grid">
              {pricingPlans.map((plan) => (
                <article
                  className={`pricing-card${plan.featured ? " pricing-card-featured" : ""}`}
                  key={plan.name}
                >
                  <div>
                    <span className="plan-label">{plan.name}</span>
                    <div className="plan-price">
                      <strong className={plan.textPrice ? "plan-price-text" : undefined}>
                        {plan.price}
                      </strong>
                      {plan.cadence && <small>{plan.cadence}</small>}
                    </div>
                    <p className={`plan-note${plan.featured ? " plan-note-featured" : ""}`}>
                      {plan.note}
                    </p>
                  </div>

                  <ul>
                    {plan.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>

                  <a
                    className={`${plan.featured ? "primary-btn" : "secondary-btn"} pricing-card-btn`}
                    href="mailto:hello@talaan.app"
                  >
                    {plan.cta}
                  </a>
                </article>
              ))}
            </div>

            <section className="pricing-faq" aria-label="Common questions">
              <h2>Common Questions</h2>
              <div className="pricing-faq-list">
                {commonQuestions.map((item) => (
                  <article className="pricing-faq-row" key={item.question}>
                    <span>[{item.id}]</span>
                    <div>
                      <h3>{item.question}</h3>
                      <p>{item.answer}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </section>
        ) : page === "contact" ? (
          <section className="contact-page" aria-label="Contact Talaan">
            <div className="contact-heading">
              <h1>Let's Talk</h1>
              <p className="lede">
                Have questions or feedback? We would love to hear from you.
              </p>
            </div>

            <div className="contact-grid">
              <section className="contact-form-card" aria-label="Send a message">
                <form className="contact-form" onSubmit={(event) => event.preventDefault()}>
                  <label htmlFor="contact-name">Name *</label>
                  <input id="contact-name" type="text" placeholder="Your name" />

                  <label htmlFor="contact-email">Email *</label>
                  <input id="contact-email" type="email" placeholder="you@email.com" />

                  <label htmlFor="contact-subject">Subject *</label>
                  <input id="contact-subject" type="text" placeholder="What's this about?" />

                  <label htmlFor="contact-category">Category</label>
                  <select id="contact-category" defaultValue="General Inquiry">
                    <option>General Inquiry</option>
                    <option>Support</option>
                    <option>Feedback</option>
                    <option>Partnership</option>
                  </select>

                  <label htmlFor="contact-message">Message *</label>
                  <textarea
                    id="contact-message"
                    rows={6}
                    placeholder="Tell us what's on your mind..."
                  />

                  <button className="primary-btn contact-submit" type="submit">
                    Send Message
                  </button>
                  <p className="contact-policy">
                    By submitting this form, you agree to our privacy policy.
                  </p>
                </form>
              </section>
            </div>

            <section className="contact-other" aria-label="Other ways to connect">
              <h2>Other Ways to Connect</h2>
              <div className="contact-other-list">
                {otherWaysToConnect.map((item) => (
                  <article className="contact-other-row" key={item.title}>
                    <span>[{item.id}]</span>
                    <div>
                      <h3>{item.title}</h3>
                      <p>{item.description}</p>
                      <a href={item.href}>{item.cta}</a>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </section>
        ) : page === "team" ? (
          <section className="team-page" aria-label="Talaan team">
            <div className="team-photo-wrap">
              <img
                className="team-photo"
                src="/mark-fordan.jpg"
                alt="Mark Fordan"
              />
            </div>

            <div className="team-copy">
              <h1>Mark Anthony Fordan</h1>
              <p className="lede">
                Creator and developer of Talaan, building a practical budgeting
                companion for people who want clearer cashflow, cleaner spending
                habits, and fewer money surprises.
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
