import useRoute from "./useRoute";
import NavIcon from "./NavIcon";
import Dashboard from "./Dashboard";
import { useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { auth, firebaseConfigured } from "./firebase";
import { callWorkspaceFunction } from "./data/repositories";

const scanItems = [
  "Track bills and everyday spending",
  "Organize bills and subscriptions",
  "Set spending guardrails",
  "Plan paydays and savings goals",
];

const navItems = ["Features", "Pricing", "Team", "Contact"];

const dashboardStats = [
  { label: "Budget health", value: "82%", note: "+6% from last month" },
  { label: "Projected spare", value: "$420", note: "after upcoming bills" },
  { label: "Bill runway", value: "7d", note: "next payment window" },
  { label: "Subscriptions", value: "4", note: "$76 monthly total" },
];

const pricingPlans = [
  {
    name: "Free",
    price: "$0",
    note: "No credit card required",
    cta: "Open your workspace",
    features: [
      "Manual income and expense planning",
      "Categorized money events",
      "Monthly plan summary",
      "Plan status and reminders in Schedule",
      "Goal tracking",
      "Budget mood indicator",
      "Local data backup and restore",
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
    cta: "Ask for documentation",
  },
  {
    id: "02",
    title: "Community",
    description: "Join our updates and product discussions.",
    cta: "Ask about the community",
  },
  {
    id: "03",
    title: "FAQ",
    description: "Get quick answers about Talaan.",
    cta: "Ask a question",
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

function DonationForm({ user, onSignIn }) {
  const [amount, setAmount] = useState("10");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setStatus("");
    setBusy(true);
    try {
      const result = await callWorkspaceFunction("createDonationCheckout", {
        amountCents: Math.round(Number(amount) * 100),
        successUrl: `${location.origin}${location.pathname}?donation=success#pricing`,
        cancelUrl: `${location.origin}${location.pathname}?donation=cancelled#pricing`,
      });
      if (!result?.checkoutUrl) throw new Error("Checkout URL missing.");
      location.assign(result.checkoutUrl);
    } catch {
      setStatus(user ? "Checkout could not be started. Please try again." : "Sign in before donating so we can attach supporter status.");
    } finally {
      setBusy(false);
    }
  }
  return <form className="donation-form" onSubmit={submit}><label>Donation amount (USD)<input required type="number" min="1" max="10000" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>{user ? <button className="secondary-btn pricing-card-btn" disabled={busy}>{busy ? "Opening checkout…" : "Donate securely"}</button> : <button type="button" className="secondary-btn pricing-card-btn" onClick={onSignIn}>Sign in to donate</button>}{status && <p role="alert">{status}</p>}</form>;
}

function ContactForm({ user, onSignIn }) {
  const [form, setForm] = useState({ subject: "General question", message: "" });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      await callWorkspaceFunction("sendSupportMessage", form);
      setForm({ subject: "General question", message: "" });
      setStatus("Thanks — your message was sent.");
    } catch {
      setStatus("Your message could not be sent. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  if (!user) return <div><p>Sign in so we can reply securely to your account email.</p><button className="primary-btn" type="button" onClick={onSignIn}>Sign in to contact support</button></div>;
  return <form className="contact-form" onSubmit={submit}><label>Topic<select value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })}><option>General question</option><option>Product feedback</option><option>Account support</option><option>Privacy request</option></select></label><label>Message<textarea required rows="6" maxLength="4000" value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} /></label><button className="primary-btn contact-submit" disabled={busy}>{busy ? "Sending…" : "Send message"}</button>{status && <p role={status.startsWith("Thanks") ? "status" : "alert"}>{status}</p>}</form>;
}

function App() {
  const [page, setPage] = useRoute("page", "home");
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(Boolean(auth));
  const [authError, setAuthError] = useState("");
  const [donationStatus, setDonationStatus] = useState(() => {
    const params = new URLSearchParams(location.search);
    const value = params.get("donation") || params.get("status");
    return ["success", "cancelled"].includes(value) ? value : "";
  });

  useEffect(() => {
    if (!donationStatus) return;
    if (location.pathname.endsWith("/donate")) {
      const basePath = location.pathname.slice(0, -"/donate".length) || "/";
      history.replaceState(
        null,
        "",
        `${basePath}?donation=${donationStatus}#pricing`,
      );
    }
    setPage("pricing");
  }, [donationStatus]);

  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      return undefined;
    }

    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);

      if (currentUser) {
        if (!window.location.hash || window.location.hash === "#auth") {
          setPage("workspace");
        }
      }
    });
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [page]);

  const openAuth = () => {
    setPage("auth");
    setAuthError("");
  };

  const handleGoogleAuth = async () => {
    setAuthError("");

    if (!firebaseConfigured || !auth) {
      setPage("auth");
      setAuthError("Sign-in is not available yet. Please try again later.");
      return;
    }

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
      setPage("workspace");
    } catch (error) {
      setAuthError(error.message || "Google sign-in failed. Please try again.");
    }
  };

  const handleSignOut = async () => {
    if (!auth) {
      return;
    }

    await signOut(auth);
    setPage("home");
  };

  return (
    <main className={`shell ${["dashboard","personal"].includes(page)||(page==="workspace"&&user)?"workspace-host":""}`}>
      <section className="screen" aria-label="Talaan budgeting app">
        <header className="topbar">
          <button
            className="brand"
            type="button"
            aria-label="Talaan home"
            onClick={() => {
              setPage(user ? "workspace" : "home");
            }}
          >
            <span className="brand-mark" />
            <span>talaan</span>
          </button>

          {!user && page !== "dashboard" && (
            <nav aria-label="Primary navigation">
              {navItems.map((item) => (
                <button
                  key={item}
                  aria-current={(item.toLowerCase() === page || (item === "Features" && page === "home")) ? "page" : undefined}
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
                  }}
                >
                  <NavIcon name={item === "Features" ? "home" : item.toLowerCase()} />
                  {item === "Features" ? "Home" : item}
                </button>
              ))}
            </nav>
          )}

          {user ? (
            <button className="auth-chip" type="button" onClick={handleSignOut}>
              Sign out
            </button>
          ) : (
            <button className="auth-chip" type="button" onClick={openAuth}>
              Sign in
            </button>
          )}
        </header>

        {page === "workspace" && user ? (
          <Dashboard key={user.uid} user={user} storageId={user.uid} onAccount={handleSignOut} />
        ) : page === "dashboard" ? (
          <Dashboard key="demo" storageId="demo" onAccount={openAuth} />
        ) : page === "personal" ? (
          <Dashboard key="personal" storageId="personal" onAccount={openAuth} />
        ) : page === "welcome" ? (
          <section className="welcome-page"><h1>Your money.<br/>Your starting point.</h1><p>Try a sample plan or start your own. Everything stays in this browser; no sign-in needed.</p><button className="primary-btn" onClick={()=>setPage('dashboard')}>Explore sample plan</button><button className="secondary-btn" onClick={()=>{if(!localStorage.getItem('talaan-budget-v1-personal'))localStorage.setItem('talaan-budget-v1-personal','[]');if(!localStorage.getItem('talaan-goals-personal'))localStorage.setItem('talaan-goals-personal','[]');setPage('personal');}}>Start / continue my plan</button></section>
        ) : page === "auth" ? (
          <section className="auth-page" aria-label="Talaan sign in">
            <div className="auth-panel">
              <div className="auth-copy">
                <span className="auth-kicker">Google auth</span>
                <h1>Start with Google.</h1>
                <p className="lede">
                  A clearer view of your money starts here. Sign in securely with your Google account.
                </p>
              </div>

              <div className="auth-card">
                <button
                  className="google-btn"
                  type="button"
                  onClick={handleGoogleAuth}
                  disabled={authLoading}
                >
                  <span aria-hidden="true">G</span>
                  {authLoading ? "Checking session..." : "Continue with Google"}
                </button>
                <p>
                  One account. No extra password to remember.
                </p>

                {authError && <p className="auth-error">{authError}</p>}
                {!firebaseConfigured && (
                  <p className="auth-error">
                    Sign-in is currently unavailable. Please check back later.
                  </p>
                )}
              </div>
            </div>
          </section>
        ) : page === "pricing" ? (
          <section className="pricing-page" aria-label="Talaan pricing">
            {donationStatus && <div className={`donation-return donation-${donationStatus}`} role={donationStatus === "success" ? "status" : "alert"}><strong>{donationStatus === "success" ? "Thank you for supporting Talaan." : "Donation checkout was cancelled."}</strong><button type="button" onClick={() => { setDonationStatus(""); history.replaceState(null, "", `${location.pathname}#pricing`); }}>Dismiss</button></div>}
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

                  {plan.featured ? <DonationForm user={user} onSignIn={openAuth} /> : <a
                    className="primary-btn pricing-card-btn"
                    href="#welcome"
                    onClick={(event) => {
                      event.preventDefault();
                      setPage("welcome");
                    }}
                  >
                    {plan.cta}
                  </a>}
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
                <h2>Send us a message.</h2><p>Questions, feedback, and account support are welcome.</p><ContactForm user={user} onSignIn={openAuth} />
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
                      <button className="text-action" type="button" onClick={() => document.querySelector(".contact-form input")?.focus()}>{item.cta}</button>
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
              <span className="intro-wordmark">talaan<span className="wordmark-period">.</span></span>
              <h1>Your money. <br />A little clearer.</h1>
              <ul className="intro-features" aria-label="Talaan features">
                {scanItems.map((item, index) => <li key={item}><span aria-hidden="true">[{String(index + 1).padStart(2, "0")}]</span>{item}</li>)}
              </ul>


            </div>
          </section>

              <div className="cta-row" id="signup">
                <button
                  className="primary-btn"
                  type="button"
                  onClick={() => setPage("welcome")}
                >
                  Open your workspace
                </button>

              </div>
          </div>
        )}

      </section>
    </main>
  );
}

export default App;
