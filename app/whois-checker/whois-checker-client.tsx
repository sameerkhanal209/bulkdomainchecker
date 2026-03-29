"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SiteShell from "../components/site-shell";

type WhoisContact = {
  role: string;
  name?: string;
  organization?: string;
  email?: string;
  phone?: string;
  country?: string;
  city?: string;
  address?: string;
};

type WhoisResponse = {
  domain: string;
  status: "found" | "not_found" | "invalid" | "error";
  message: string;
  registrar?: string;
  registrarIanaId?: string;
  abuseEmail?: string;
  abusePhone?: string;
  createdAt?: string;
  updatedAt?: string;
  expiresAt?: string;
  dnssec?: string;
  registryDomainId?: string;
  nameservers?: string[];
  statuses?: string[];
  contacts?: WhoisContact[];
  notices?: string[];
  links?: string[];
};

type DnsResponse = {
  domain: string;
  status: "found" | "invalid" | "error";
  message: string;
  records: {
    A: string[];
    AAAA: string[];
    CNAME: string[];
    MX: string[];
    NS: string[];
    TXT: string[];
    SOA: string[];
  };
};

type ActiveTab = "whois" | "dns";

function formatRole(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value?: string) {
  if (!value) {
    return "Not available";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function groupContacts(contacts?: WhoisContact[]) {
  const map = new Map<string, WhoisContact[]>();

  for (const contact of contacts ?? []) {
    const key = contact.role;
    const current = map.get(key) ?? [];
    current.push(contact);
    map.set(key, current);
  }

  return Array.from(map.entries());
}

export default function WhoisCheckerClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [domain, setDomain] = useState("");
  const [whoisResult, setWhoisResult] = useState<WhoisResponse | null>(null);
  const [dnsResult, setDnsResult] = useState<DnsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("whois");
  const [error, setError] = useState("");
  const autoLoadedDomainRef = useRef<string | null>(null);

  const requestedDomain = searchParams.get("domain")?.trim() ?? "";

  async function runLookup(query: string) {
    setError("");
    setWhoisResult(null);
    setDnsResult(null);

    if (!query) {
      setError("Enter a domain name.");
      return;
    }

    setLoading(true);

    try {
      const [whoisResponse, dnsResponse] = await Promise.all([
        fetch(`/api/whois?domain=${encodeURIComponent(query)}`),
        fetch(`/api/dns?domain=${encodeURIComponent(query)}`),
      ]);

      const [whoisBody, dnsBody] = await Promise.all([
        whoisResponse.json().catch(() => null),
        dnsResponse.json().catch(() => null),
      ]);

      if (!whoisResponse.ok) {
        setError(whoisBody?.error || "Unable to load WHOIS data right now.");
      } else {
        setWhoisResult(whoisBody);
      }

      if (dnsResponse.ok) {
        setDnsResult(dnsBody);
      }

      if (!whoisResponse.ok && dnsResponse.ok) {
        setActiveTab("dns");
      } else if (whoisResponse.ok) {
        setActiveTab("whois");
      }
    } catch {
      setError("Unable to load lookup data right now.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLookup(event: React.FormEvent) {
    event.preventDefault();
    const query = domain.trim();
    if (!query) {
      setError("Enter a domain name.");
      return;
    }

    router.replace(`/whois-checker?domain=${encodeURIComponent(query)}`);
    await runLookup(query);
  }

  useEffect(() => {
    if (!requestedDomain) {
      autoLoadedDomainRef.current = null;
      return;
    }

    setDomain(requestedDomain);

    if (autoLoadedDomainRef.current === requestedDomain) {
      return;
    }

    autoLoadedDomainRef.current = requestedDomain;
    void runLookup(requestedDomain);
  }, [requestedDomain]);

  const groupedContacts = groupContacts(whoisResult?.contacts);
  const dnsEntries = dnsResult ? Object.entries(dnsResult.records) : [];
  const activeLookupDomain = whoisResult?.domain || dnsResult?.domain || requestedDomain || domain.trim();

  return (
    <SiteShell activePage="whois" topbarTitle="WHOIS Checker">
      <section className="hero">
        <h1 className="hero-title">{activeLookupDomain ? `${activeLookupDomain} WHOIS Lookup` : "WHOIS Checker"}</h1>
        <p className="hero-copy">
          Look up ownership details, registrar data, registration dates, nameservers, and live DNS records for .com, .net, .org, .io, and other standard TLDs.
        </p>

        <div className="search-zone">
          <form className="search-bar" onSubmit={handleLookup}>
            <div className="search-input">
              <input
                className="search-field"
                type="text"
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                placeholder="example.org"
                aria-label="Domain"
              />
            </div>
            <button type="submit" className="search-button" disabled={loading || !domain.trim()}>
              {loading ? "Searching" : "Search"}
            </button>
          </form>
        </div>

        {error && <p className="form-error generator-error">{error}</p>}
      </section>

      {(whoisResult || dnsResult) && (
        <>
          <section className="filter-strip">
            <div className="strip-group">
              <div className="strip-label">View</div>
              <button type="button" className={activeTab === "whois" ? "chip active" : "chip"} onClick={() => setActiveTab("whois")}>
                WHOIS
              </button>
              <button type="button" className={activeTab === "dns" ? "chip active" : "chip"} onClick={() => setActiveTab("dns")}>
                DNS
              </button>
            </div>
          </section>

          {activeTab === "whois" && whoisResult && (
            <section className="whois-layout">
              <div className="whois-main-stack">
                <div className="whois-main-card">
                  <div className="whois-head">
                    <div>
                      <h2 className="whois-domain">{whoisResult.domain}</h2>
                      <p className="whois-message">{whoisResult.message}</p>
                    </div>
                    <span
                      className={`status-badge ${
                        whoisResult.status === "found"
                          ? "status-available"
                          : whoisResult.status === "not_found"
                            ? "status-taken"
                            : "status-invalid"
                      }`}
                    >
                      {whoisResult.status === "found" ? "Found" : whoisResult.status === "not_found" ? "Not found" : whoisResult.status}
                    </span>
                  </div>

                  <div className="whois-info-grid">
                    <div className="whois-info-card">
                      <div className="whois-label">Registrar</div>
                      <div className="whois-value">{whoisResult.registrar || "Not available"}</div>
                    </div>
                    <div className="whois-info-card">
                      <div className="whois-label">Registrar IANA ID</div>
                      <div className="whois-value">{whoisResult.registrarIanaId || "Not available"}</div>
                    </div>
                    <div className="whois-info-card">
                      <div className="whois-label">Registered</div>
                      <div className="whois-value">{formatDate(whoisResult.createdAt)}</div>
                    </div>
                    <div className="whois-info-card">
                      <div className="whois-label">Updated</div>
                      <div className="whois-value">{formatDate(whoisResult.updatedAt)}</div>
                    </div>
                    <div className="whois-info-card">
                      <div className="whois-label">Expires</div>
                      <div className="whois-value">{formatDate(whoisResult.expiresAt)}</div>
                    </div>
                    <div className="whois-info-card">
                      <div className="whois-label">DNSSEC</div>
                      <div className="whois-value">{whoisResult.dnssec || "Not available"}</div>
                    </div>
                    <div className="whois-info-card">
                      <div className="whois-label">Registry Domain ID</div>
                      <div className="whois-value">{whoisResult.registryDomainId || "Not available"}</div>
                    </div>
                    <div className="whois-info-card">
                      <div className="whois-label">Abuse Contact</div>
                      <div className="whois-value">
                        {[whoisResult.abuseEmail, whoisResult.abusePhone].filter(Boolean).join(" / ") || "Not available"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="whois-list-card">
                  <h3>Registrant and contacts</h3>
                  {groupedContacts.length > 0 ? (
                    <div className="whois-contact-group-grid">
                      {groupedContacts.map(([role, contacts]) => (
                        <div key={role} className="whois-contact-group">
                          <div className="whois-contact-group-title">{formatRole(role)}</div>
                          <div className="whois-contact-grid">
                            {contacts.map((contact, index) => (
                              <div key={`${role}-${contact.email || contact.name || index}`} className="whois-contact-card">
                                <div className="whois-contact-details">
                                  {contact.name && <div><strong>Name:</strong> {contact.name}</div>}
                                  {contact.organization && <div><strong>Organization:</strong> {contact.organization}</div>}
                                  {contact.email && <div><strong>Email:</strong> {contact.email}</div>}
                                  {contact.phone && <div><strong>Phone:</strong> {contact.phone}</div>}
                                  {contact.city && <div><strong>City:</strong> {contact.city}</div>}
                                  {contact.country && <div><strong>Country:</strong> {contact.country}</div>}
                                  {contact.address && <div><strong>Address:</strong> {contact.address}</div>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="whois-empty">Registrant details are hidden or not published for this domain.</p>
                  )}
                </div>
              </div>

              <div className="whois-side-grid">
                <div className="whois-list-card">
                  <h3>Nameservers</h3>
                  {whoisResult.nameservers && whoisResult.nameservers.length > 0 ? (
                    <ul className="whois-list">
                      {whoisResult.nameservers.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="whois-empty">No nameservers returned.</p>
                  )}
                </div>

                <div className="whois-list-card">
                  <h3>Domain status</h3>
                  {whoisResult.statuses && whoisResult.statuses.length > 0 ? (
                    <ul className="whois-list">
                      {whoisResult.statuses.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="whois-empty">No status codes returned.</p>
                  )}
                </div>

                <div className="whois-list-card">
                  <h3>Notices</h3>
                  {whoisResult.notices && whoisResult.notices.length > 0 ? (
                    <ul className="whois-list">
                      {whoisResult.notices.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="whois-empty">No notices returned.</p>
                  )}
                </div>

                <div className="whois-list-card">
                  <h3>RDAP links</h3>
                  {whoisResult.links && whoisResult.links.length > 0 ? (
                    <ul className="whois-list">
                      {whoisResult.links.map((item) => (
                        <li key={item}>
                          <a href={item} target="_blank" rel="noreferrer">{item}</a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="whois-empty">No links returned.</p>
                  )}
                </div>
              </div>
            </section>
          )}

          {activeTab === "dns" && dnsResult && (
            <section className="dns-layout">
              <div className="whois-main-card">
                <div className="whois-head">
                  <div>
                    <h2 className="whois-domain">{dnsResult.domain}</h2>
                    <p className="whois-message">{dnsResult.message}</p>
                  </div>
                  <span className={`status-badge ${dnsResult.status === "found" ? "status-available" : "status-invalid"}`}>
                    {dnsResult.status === "found" ? "Found" : dnsResult.status === "invalid" ? "Invalid" : "No records"}
                  </span>
                </div>

                <div className="dns-record-grid">
                  {dnsEntries.map(([type, values]) => (
                    <div key={type} className="dns-record-card">
                      <div className="dns-record-type">{type}</div>
                      {values.length > 0 ? (
                        <ul className="whois-list">
                          {values.map((value) => (
                            <li key={`${type}-${value}`}>{value}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="whois-empty">No records returned.</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </>
      )}

      <footer className="theme-footer">
        <span>Powered by <a href="https://aeonfree.com" target="_blank" rel="noreferrer">aeonfree.com</a>, <a href="https://free-hosting.org" target="_blank" rel="noreferrer">free-hosting.org</a>, <a href="https://subtract.site" target="_blank" rel="noreferrer">subtract.site</a>.</span>
        <span>Copyright &copy; {new Date().getFullYear()} <a href="https://sameerkhanal.com" target="_blank" rel="noreferrer">Sameer Khanal</a>.</span>
      </footer>
    </SiteShell>
  );
}
