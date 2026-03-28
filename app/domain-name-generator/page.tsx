"use client";

import { useMemo, useState } from "react";
import SiteShell from "../components/site-shell";

type SuggestionResult = { domain: string; status?: string; message?: string };
type SortBy = "popularity" | "length" | "alphabetical";
type TermFilter = "all" | "starts" | "ends";
type LengthFilter = "all" | "short" | "medium" | "long";
type AvailabilityFilter = "all" | "available" | "unavailable";

const registerUrl = "https://www.namesilo.com/register.php?rid=6309463gf";

function CheckIcon() {
  return (
    <svg viewBox="0 0 512 512" aria-hidden="true" className="side-check-icon">
      <path d="M469.402,35.492C334.09,110.664,197.114,324.5,197.114,324.5L73.509,184.176L0,254.336l178.732,222.172 l65.15-2.504C327.414,223.414,512,55.539,512,55.539L469.402,35.492z" />
    </svg>
  );
}

function normalizeTerm(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isUnavailable(status?: string) {
  return status === "taken";
}

function isUncertainResult(result?: SuggestionResult) {
  return Boolean(result?.message?.startsWith("rate_limited:"));
}

function getDisplayMessage(result?: SuggestionResult) {
  if (!result) {
    return "";
  }

  if (isUncertainResult(result)) {
    return "Available";
  }

  return result.message || "";
}

function scoreSuggestion(domain: string, term: string) {
  let score = 0;

  if (domain.startsWith(term)) score += 4;
  if (domain.endsWith(term)) score += 2;
  score -= Math.max(0, domain.length - term.length);

  return score;
}

function highlightMatch(domain: string, term: string) {
  if (!term) {
    return domain;
  }

  const index = domain.toLowerCase().indexOf(term);
  if (index === -1) {
    return domain;
  }

  const before = domain.slice(0, index);
  const match = domain.slice(index, index + term.length);
  const after = domain.slice(index + term.length);

  return (
    <>
      {before}
      <strong>{match}</strong>
      {after}
    </>
  );
}

export default function DomainNameGenerator() {
  const [term, setTerm] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [checkCache, setCheckCache] = useState<Record<string, SuggestionResult>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<{ domain: string; result?: SuggestionResult } | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("popularity");
  const [termFilter, setTermFilter] = useState<TermFilter>("all");
  const [lengthFilter, setLengthFilter] = useState<LengthFilter>("all");
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>("all");
  const [loadTimeMs, setLoadTimeMs] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [pageSizes, setPageSizes] = useState<number[]>([]);
  const pageLimit = 30;

  async function fetchSuggestionPage(query: string, offset: number) {
    const response = await fetch(`/api/suggest-domains?q=${encodeURIComponent(query)}&offset=${offset}&limit=${pageLimit}`);
    const body = await response.json().catch(() => null);

    if (!response.ok || !body?.suggestions || !body?.results) {
      throw new Error("Suggestion request failed");
    }

    return body as { suggestions: string[]; results: Record<string, SuggestionResult>; hasMore: boolean; nextOffset: number };
  }

  async function loadSuggestions() {
    const query = normalizeTerm(term);
    if (query.length < 2) {
      setError("Enter at least 2 characters.");
      return;
    }

    setError("");
    setIsLoading(true);
    setSuggestions([]);
    setCheckCache({});
    setLoadTimeMs(null);
    setHasMore(false);
    setNextOffset(0);
    setPageSizes([]);

    const startTime = performance.now();

    try {
      const body = await fetchSuggestionPage(query, 0);
      setSuggestions(body.suggestions);
      setCheckCache(body.results);
      setHasMore(body.hasMore);
      setNextOffset(body.nextOffset);
      setPageSizes(body.suggestions.length > 0 ? [body.suggestions.length] : []);
      setLoadTimeMs(performance.now() - startTime);
      setTerm(query);
    } catch {
      setError("Unable to load suggestions right now.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadMoreSuggestions() {
    const query = normalizeTerm(term);
    if (!hasMore || isLoadingMore || query.length < 2) {
      return;
    }

    setIsLoadingMore(true);

    try {
      const body = await fetchSuggestionPage(query, nextOffset);
      const nextSuggestions = body.suggestions.filter((domain) => !suggestions.includes(domain));
      setSuggestions((current) => [...current, ...nextSuggestions]);
      setCheckCache((current) => ({ ...current, ...body.results }));
      setHasMore(body.hasMore);
      setNextOffset(body.nextOffset);
      if (nextSuggestions.length > 0) {
        setPageSizes((current) => [...current, nextSuggestions.length]);
      }
    } catch {
      setError("Unable to load more suggestions right now.");
    } finally {
      setIsLoadingMore(false);
    }
  }

  const normalizedTerm = useMemo(() => normalizeTerm(term), [term]);

  const filteredSuggestions = useMemo(() => {
    let list = [...suggestions];

    if (termFilter === "starts") {
      list = list.filter((domain) => domain.startsWith(normalizedTerm));
    } else if (termFilter === "ends") {
      list = list.filter((domain) => domain.endsWith(normalizedTerm));
    }

    if (lengthFilter === "short") {
      list = list.filter((domain) => domain.length <= 10);
    } else if (lengthFilter === "medium") {
      list = list.filter((domain) => domain.length >= 11 && domain.length <= 15);
    } else if (lengthFilter === "long") {
      list = list.filter((domain) => domain.length >= 16);
    }

    if (availabilityFilter === "available") {
      list = list.filter((domain) => checkCache[domain]?.status === "available");
    } else if (availabilityFilter === "unavailable") {
      list = list.filter((domain) => isUnavailable(checkCache[domain]?.status));
    }

    if (sortBy === "length") {
      list.sort((left, right) => left.length - right.length || left.localeCompare(right));
    } else if (sortBy === "alphabetical") {
      list.sort((left, right) => left.localeCompare(right));
    } else {
      list.sort((left, right) => scoreSuggestion(right, normalizedTerm) - scoreSuggestion(left, normalizedTerm));
    }

    return list;
  }, [availabilityFilter, checkCache, lengthFilter, normalizedTerm, sortBy, suggestions, termFilter]);

  const availableCount = suggestions.filter((domain) => checkCache[domain]?.status === "available").length;
  const unavailableCount = suggestions.filter((domain) => isUnavailable(checkCache[domain]?.status)).length;
  const allChecked = suggestions.length > 0 && suggestions.every((domain) => Boolean(checkCache[domain]));

  const pagedSuggestions = useMemo(() => {
    if (pageSizes.length === 0) {
      return filteredSuggestions.length > 0 ? [filteredSuggestions] : [];
    }

    const sections: string[][] = [];
    let offset = 0;

    for (const size of pageSizes) {
      const sourceSlice = suggestions.slice(offset, offset + size);
      const section = filteredSuggestions.filter((domain) => sourceSlice.includes(domain));
      if (section.length > 0) {
        sections.push(section);
      }
      offset += size;
    }

    return sections;
  }, [filteredSuggestions, pageSizes, suggestions]);

  return (
    <SiteShell activePage="generator" topbarTitle="Domain Name Generator">
      <section className="hero">
        <h1 className="hero-title">Domain Name Generator</h1>
        <p className="hero-copy">
          A cleaner way to search around one keyword, compare the shortlist, and keep only the names that still feel usable.
        </p>

        <div className="search-zone">
          <form
            className="search-bar"
            onSubmit={(event) => {
              event.preventDefault();
              void loadSuggestions();
            }}
          >
            <div className="search-input">
              <input
                className="search-field"
                type="text"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Try gaming"
                aria-label="Keyword"
              />
            </div>
            <button type="submit" className="search-button" disabled={isLoading || normalizeTerm(term).length < 2}>
              {isLoading ? "Searching" : "Search"}
            </button>
          </form>

          {allChecked && suggestions.length > 0 && (
            <div className="search-meta">
              Found {filteredSuggestions.length} domains for "{normalizedTerm}" in {((loadTimeMs ?? 0) / 1000).toFixed(3)} seconds. {availableCount} available, {unavailableCount} unavailable.
            </div>
          )}
        </div>

        {error && <p className="form-error generator-error">{error}</p>}
      </section>

      {allChecked && suggestions.length > 0 && (
        <>
          <section className="filter-strip">
            <div className="strip-group">
              <div className="strip-label">Match</div>
              <button type="button" className={termFilter === "all" ? "chip active" : "chip"} onClick={() => setTermFilter("all")}>
                Contains
              </button>
              <button type="button" className={termFilter === "starts" ? "chip active" : "chip"} onClick={() => setTermFilter("starts")}>
                Starts with
              </button>
              <button type="button" className={termFilter === "ends" ? "chip active" : "chip"} onClick={() => setTermFilter("ends")}>
                Ends with
              </button>
            </div>

            <div className="strip-group">
              <div className="strip-label">Length</div>
              <button type="button" className={lengthFilter === "all" ? "chip active" : "chip"} onClick={() => setLengthFilter("all")}>
                All
              </button>
              <button type="button" className={lengthFilter === "short" ? "chip active" : "chip"} onClick={() => setLengthFilter("short")}>
                Short
              </button>
              <button type="button" className={lengthFilter === "medium" ? "chip active" : "chip"} onClick={() => setLengthFilter("medium")}>
                Medium
              </button>
              <button type="button" className={lengthFilter === "long" ? "chip active" : "chip"} onClick={() => setLengthFilter("long")}>
                Long
              </button>
            </div>
          </section>

          <section className="content-grid">
            <div className="results-panel">
              {pagedSuggestions.map((section, index) => (
                <div key={`section-${index}`} className={index === 0 ? "results-section" : "results-section results-section-new"}>
                  {index > 0 && <div className="results-section-label">More results</div>}
                  <div className="results-grid">
                    {section.map((domain) => {
                      const result = checkCache[domain];
                      const isAvailable = result?.status === "available";
                      const isUncertain = isUncertainResult(result);

                      return (
                        <button
                          key={domain}
                          type="button"
                          className={`result-tile ${isAvailable ? "soft-green" : "soft-red"}`}
                          onClick={() => setModal({ domain, result })}
                        >
                          <span className="result-name">
                            {highlightMatch(domain, normalizedTerm)}
                            {isUncertain && (
                              <sup
                                className="result-sup"
                                title={result?.message || "rate_limited: RDAP lookup was limited or unavailable"}
                              >
                                [1]
                              </sup>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {hasMore && (
                <div className="load-more-wrap">
                  <button className="secondary-button generator-load-more" onClick={loadMoreSuggestions} disabled={isLoadingMore}>
                    {isLoadingMore ? (
                      <span className="button-loader-wrap">
                        <span className="loader loader-inline" aria-hidden="true">
                          <span />
                          <span />
                          <span />
                        </span>
                        Loading more
                      </span>
                    ) : "Load more"}
                  </button>
                </div>
              )}
            </div>

            <aside className="sidebar">
              <div className="side-group">
                <div className="side-title">Sort Results</div>
                <button type="button" className={sortBy === "popularity" ? "side-option active" : "side-option"} onClick={() => setSortBy("popularity")}>
                  <span className="check">{sortBy === "popularity" ? <CheckIcon /> : null}</span>
                  <span className="side-option-text">Popularity</span>
                </button>
                <button type="button" className={sortBy === "length" ? "side-option active" : "side-option"} onClick={() => setSortBy("length")}>
                  <span className="check">{sortBy === "length" ? <CheckIcon /> : null}</span>
                  <span className="side-option-text">Length</span>
                </button>
                <button type="button" className={sortBy === "alphabetical" ? "side-option active" : "side-option"} onClick={() => setSortBy("alphabetical")}>
                  <span className="check">{sortBy === "alphabetical" ? <CheckIcon /> : null}</span>
                  <span className="side-option-text">Alphabetical</span>
                </button>
              </div>

              <div className="side-group">
                <div className="side-title">Availability</div>
                <button type="button" className={availabilityFilter === "available" ? "side-option active" : "side-option"} onClick={() => setAvailabilityFilter("available")}>
                  <span className="check">{availabilityFilter === "available" ? <CheckIcon /> : null}</span>
                  <span className="side-option-text">Available only</span>
                </button>
                <button type="button" className={availabilityFilter === "all" ? "side-option active" : "side-option"} onClick={() => setAvailabilityFilter("all")}>
                  <span className="check">{availabilityFilter === "all" ? <CheckIcon /> : null}</span>
                  <span className="side-option-text">All results</span>
                </button>
                <button type="button" className={availabilityFilter === "unavailable" ? "side-option active" : "side-option"} onClick={() => setAvailabilityFilter("unavailable")}>
                  <span className="check">{availabilityFilter === "unavailable" ? <CheckIcon /> : null}</span>
                  <span className="side-option-text">Unavailable only</span>
                </button>
              </div>
            </aside>
          </section>
        </>
      )}

      {!allChecked && isLoading && (
        <section className="loading-panel">
          <div className="loader" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="loading-label">Looking up suggestions...</div>
        </section>
      )}

      <footer className="theme-footer">
        <span>Powered by <a href="https://aeonfree.com" target="_blank" rel="noreferrer">aeonfree.com</a>, <a href="https://free-hosting.org" target="_blank" rel="noreferrer">free-hosting.org</a>, <a href="https://subtract.site" target="_blank" rel="noreferrer">subtract.site</a>.</span>
        <span>Copyright &copy; {new Date().getFullYear()} <a href="https://sameerkhanal.com" target="_blank" rel="noreferrer">Sameer Khanal</a>.</span>
      </footer>

      {modal && (
        <div className="modal-bg" onClick={() => setModal(null)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-title-row">
              <h2>{modal.domain}.com</h2>
              <span className={`status-badge ${modal.result?.status === "available" ? "status-available" : "status-taken"}`}>
                {modal.result?.status === "available" ? "available" : "unavailable"}
              </span>
            </div>
            <p className="modal-message">{getDisplayMessage(modal.result)}</p>
            <div className="modal-actions">
              {modal.result?.status === "available" && (
                <a
                  className="primary-button modal-link"
                  href={`${registerUrl}&domain=${encodeURIComponent(`${modal.domain}.com`)}`}
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
