import useRoute from "./useRoute";
import NavIcon from "./NavIcon";
import Dashboard from "./Dashboard";
import { useEffect, useRef, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { auth, firebaseConfigured } from "./firebase";

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

const calendarWeekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getEventsForDay(day, daysInMonth) {
  const eventsByDay = {
    1: [{ label: "Rent", amount: "-$1,200", type: "bill" }],
    4: [{ label: "Power", amount: "-$148", type: "bill" }],
    8: [{ label: "Phone", amount: "-$59", type: "bill" }],
    10: [{ label: "Groceries", amount: "-$180", type: "spend" }],
    15: [{ label: "Payday", amount: "+$1,900", type: "income" }],
    20: [{ label: "Internet", amount: "-$79", type: "bill" }],
  };

  if (day === daysInMonth) {
    return [{ label: "Payday", amount: "+$1,900", type: "income" }];
  }

  return eventsByDay[day];
}

function getCurrentMonthCalendar() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const leadingBlankCount = (firstDay + 6) % 7;
  const todayDate = String(today.getDate()).padStart(2, "0");

  return {
    monthName: today.toLocaleString(undefined, { month: "long" }),
    today: today.getDate(),
    todayDate,
    leadingBlanks: Array.from({ length: leadingBlankCount }, (_, index) => index),
    days: Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;

      return {
        date: String(day).padStart(2, "0"),
        dayNumber: day,
        isToday: day === today.getDate(),
        items: getEventsForDay(day, daysInMonth),
      };
    }),
  };
}

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
    href: "mailto:hello@talaan.app?subject=Documentation",
    cta: "Ask for documentation",
  },
  {
    id: "02",
    title: "Community",
    description: "Join our updates and product discussions.",
    href: "mailto:hello@talaan.app?subject=Community",
    cta: "Ask about the community",
  },
  {
    id: "03",
    title: "FAQ",
    description: "Get quick answers about Talaan.",
    href: "mailto:hello@talaan.app?subject=FAQ",
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

function App() {
  const modalRef = useRef(null);
  const currentMonth = getCurrentMonthCalendar();
  const [page, setPage] = useRoute("page", "home");
  const isDemo = window.location.hash.startsWith("#dashboard");
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(Boolean(auth));
  const [authError, setAuthError] = useState("");
  const [selectedDate, setSelectedDate] = useState(currentMonth.todayDate);
  const [showCalendarDetail, setShowCalendarDetail] = useState(false);
  const [dashboardPage, setDashboardPage] = useState("health");

  const selectedCalendarDay = currentMonth.days.find((day) => day.date === selectedDate);
  const showHealthPage = dashboardPage !== "calendar";
  const [eventFilter, setEventFilter] = useState("upcoming");

  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      return undefined;
    }

    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);

      if (currentUser) {
        setPage("dashboard");
      }
    });
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [page, dashboardPage]);

  useEffect(() => {
    if (!showCalendarDetail) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = modalRef.current;
    dialog?.querySelector("button")?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setShowCalendarDetail(false);
      }
      if (event.key === "Tab" && dialog) {
        const controls = dialog.querySelectorAll('button, a[href], input, select, textarea, [tabindex="0"]');
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [showCalendarDetail]);

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
      setPage("dashboard");
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
    <main className="shell">
      <section className="screen" aria-label="Talaan budgeting app">
        <header className="topbar">
          <button
            className="brand"
            type="button"
            aria-label="Talaan home"
            onClick={() => {
              setPage(user ? "dashboard" : "home");
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

        {page === "dashboard" && (user || isDemo) ? (
          <Dashboard key={user?.uid || "demo"} storageId={user?.uid || localStorage.getItem("talaan-workspace") || "demo"} />
        ) : page === "welcome" ? (
          <section className="welcome-page"><h1>Your money.<br/>Your starting point.</h1><p>Try a sample plan or start your own. Everything stays in this browser; no sign-in needed.</p><button className="primary-btn" onClick={()=>{localStorage.setItem('talaan-workspace','demo');setPage('dashboard');}}>Explore sample plan</button><button className="secondary-btn" onClick={()=>{localStorage.setItem('talaan-workspace','personal');if(!localStorage.getItem('talaan-budget-v1-personal'))localStorage.setItem('talaan-budget-v1-personal','[]');if(!localStorage.getItem('talaan-goals-personal'))localStorage.setItem('talaan-goals-personal','[]');setPage('dashboard');}}>Start / continue my plan</button></section>
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
                    className={`${plan.featured ? "secondary-btn" : "primary-btn"} pricing-card-btn`}
                    href={plan.featured ? "mailto:hello@talaan.app?subject=Supporter" : "#welcome"}
                    onClick={plan.featured ? undefined : (event) => {
                      event.preventDefault();
                      setPage("welcome");
                    }}
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
                <h2>Send us an email.</h2><p>Support is handled by email. Your mail app opens a draft that you can review before sending.</p><a className="primary-btn" href="mailto:hello@talaan.app?subject=Talaan%20feedback">Open email draft</a>
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

        {showCalendarDetail && page === "dashboard" && (user || isDemo) && (
          <div
            className="modal-layer calendar-modal-layer"
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-label={`${currentMonth.monthName} ${selectedDate} money events`}
          >
            <button
              className="modal-scrim"
              type="button"
              aria-label="Close calendar details"
              onClick={() => setShowCalendarDetail(false)}
            />
            <section className="calendar-detail-modal">
              <button
                className="back-btn"
                type="button"
                onClick={() => setShowCalendarDetail(false)}
              >
                Close
              </button>
              <div className="calendar-detail" aria-live="polite">
                <span>{currentMonth.monthName} {selectedDate}</span>
                {selectedCalendarDay?.items?.length ? (
                  <div className="calendar-detail-list">
                    {selectedCalendarDay.items.map((item) => (
                      <div className={`calendar-detail-row calendar-detail-${item.type}`} key={item.label}>
                        <div>
                          <strong>{item.label}</strong>
                          <small>
                            {selectedCalendarDay.dayNumber < currentMonth.today
                              ? "Past event"
                              : selectedCalendarDay.isToday
                                ? "Today"
                                : "Expected event"}
                          </small>
                        </div>
                        <b>{item.amount}</b>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>No money events scheduled for this date.</p>
                )}
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
