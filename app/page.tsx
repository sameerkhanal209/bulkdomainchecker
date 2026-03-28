"use client";

import { useMemo, useState } from "react";
import SiteShell from "./components/site-shell";

type Result = {
  domain: string;
  status: "available" | "taken" | "invalid" | string;
  message: string;
};

const registerUrl = "https://www.namesilo.com/register.php?rid=6309463gf";

const featureCards = [
  {
    title: "Bulk domain checker",
    copy: "Check multiple domain names at once when you already have a shortlist and want a faster review.",
  },
  {
    title: "Domain Name Generator",
    copy: "Start with one keyword and generate more common, usable domain combinations around it.",
  },
  {
    title: "Availability review",
    copy: "See which names are available and which are already registered before you keep narrowing the list.",
  },
];

const toolLinks = [
  "Bulk checker",
  "Domain Name Generator",
  ".com ideas",
  "Startup names",
  "Short names",
  "Keyword matches",
];

const faqs = [
  {
    question: "How many domains can I check at once?",
    answer: "You can check up to 15 domains per request from the homepage tool.",
  },
  {
    question: "Can I use the generator before deciding on a final name?",
    answer: "Yes. Use the Domain Name Generator to explore ideas, then move the best options into the bulk checker.",
  },
  {
    question: "Do I need to use only .com?",
    answer: "The checker supports mixed extensions. The generator currently focuses on .com suggestions.",
  },
];

export default function HomePage() {
  const [domains, setDomains] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<Result | null>(null);

  const parsedDomains = useMemo(
    () =>
      domains
        .split(/\r?\n/)
        .map((domain) => domain.trim())
        .filter(Boolean),
    [domains],
  );

  const availableCount = results.filter((row) => row.status === "available").length;
  const takenCount = results.filter((row) => row.status === "taken").length;

  async function runCheck(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setResults([]);

    if (parsedDomains.length === 0) {
      setError("Enter at least one domain.");
      return;
    }

    if (parsedDomains.length > 15) {
      setError("You can check up to 15 domains at a time.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/check-domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domains: parsedDomains.join("\n") }),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.error || "Unable to check domains right now.");
      } else {
        setResults(body?.results || []);
      }
    } catch {
      setError("Unable to check domains right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SiteShell activePage="checker" topbarTitle="Domain Name Generator">
      <section className="hero">
        <h1 className="hero-title">Search domains in bulk and build a stronger shortlist.</h1>
        <p className="hero-copy">
          Use this bulk domain checker to test domain availability, or switch to the Domain Name Generator when you need more ideas for a business, project, or website.
        </p>
      </section>

      <section className="homepage-grid">
        <div className="tool-panel">
          <div className="panel-head">
            <div>
              <h2>Bulk checker</h2>
              <p>Check domain names in bulk, one per line.</p>
            </div>
            <div className="summary-pills">
              <span>{parsedDomains.length}/15 added</span>
            </div>
          </div>

          <form className="checker-form" onSubmit={runCheck}>
            <textarea
              id="domains"
              rows={9}
              value={domains}
              onChange={(event) => setDomains(event.target.value)}
              placeholder={"example.com\nmybrand.net\nstudio.dev"}
            />

            <div className="checker-actions">
              <button type="submit" className="primary-button" disabled={loading}>
                {loading ? "Checking..." : "Check domains"}
              </button>
              <span className="helper-copy">Mixed extensions are supported.</span>
            </div>
          </form>

          {error && <p className="form-error">{error}</p>}
        </div>

        <aside className="side-panel">
          <div className="side-group">
            <div className="side-title">Quick start</div>
            <div className="side-body">
              Start with your current shortlist, then use the generator to find more available domain ideas around the same keyword.
            </div>
          </div>

          <div className="side-group">
            <div className="side-title">Also useful</div>
            <div className="tag-cloud">
              {toolLinks.map((item) => (
                <span key={item} className="tag-pill">{item}</span>
              ))}
            </div>
          </div>
        </aside>
      </section>

      {results.length > 0 && (
        <section className="results-block">
          <div className="filter-strip">
            <div className="strip-group">
              <div className="strip-label">Results</div>
              <div className="chip active">{results.length} checked</div>
              <div className="chip">{availableCount} available</div>
              <div className="chip">{takenCount} taken</div>
            </div>
          </div>

          <div className="results-table-panel">
            <table className="results-table">
              <thead>
                <tr>
                  <th>Domain</th>
                  <th>Status</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row) => (
                  <tr key={row.domain} className="results-row-clickable" onClick={() => setModal(row)}>
                    <td className="domain-cell">{row.domain}</td>
                    <td>
                      <span className={`status-badge status-${row.status}`}>{row.status}</span>
                    </td>
                    <td>{row.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="detail-section">
        <div className="section-copy">
          <h2>Use the right tool at the right step</h2>
          <p>
            The homepage works best when you already have domain candidates. The Domain Name Generator is better for brainstorming common domain name patterns around a keyword.
          </p>
        </div>

        <div className="feature-grid">
          {featureCards.map((card) => (
            <article key={card.title} className="feature-card">
              <h3>{card.title}</h3>
              <p>{card.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="detail-section">
        <div className="section-copy">
          <h2>Browse common naming directions</h2>
          <p>
            Explore more domain ideas by keyword, compare short and long variations, and keep the names that are still available.
          </p>
        </div>

        <div className="tool-grid">
          {toolLinks.map((item) => (
            <a key={item} className="tool-card" href="/domain-name-generator">
              {item}
            </a>
          ))}
        </div>
      </section>

      <section className="detail-section faq-section">
        <div className="section-copy">
          <h2>FAQs</h2>
          <p>Common questions about checking domain availability and generating domain name ideas.</p>
        </div>

        <div className="faq-list">
          {faqs.map((faq) => (
            <article key={faq.question} className="faq-item">
              <h3>{faq.question}</h3>
              <p>{faq.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="theme-footer">
        <span>Powered by <a href="https://aeonfree.com" target="_blank" rel="noreferrer">aeonfree.com</a>, <a href="https://free-hosting.org" target="_blank" rel="noreferrer">free-hosting.org</a>, <a href="https://subtract.site" target="_blank" rel="noreferrer">subtract.site</a>.</span>
        <span>Copyright &copy; {new Date().getFullYear()} <a href="https://sameerkhanal.com" target="_blank" rel="noreferrer">Sameer Khanal</a>.</span>
      </footer>

      {modal && (
        <div className="modal-bg" onClick={() => setModal(null)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-title-row">
              <h2>{modal.domain}</h2>
              <span className={`status-badge status-${modal.status || "invalid"}`}>{modal.status}</span>
            </div>
            <p className="modal-message">{modal.message}</p>
            <div className="modal-actions">
              {modal.status === "available" && (
                <a
                  className="primary-button modal-link"
                  href={`${registerUrl}&domain=${encodeURIComponent(modal.domain)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Register on NameSilo
                </a>
              )}
              <button type="button" className="secondary-button" onClick={() => setModal(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </SiteShell>
  );
}
