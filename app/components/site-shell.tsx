"use client";

import Link from "next/link";
import { ReactNode } from "react";

type SiteShellProps = {
  activePage: "checker" | "generator" | "whois";
  topbarTitle: string;
  children: ReactNode;
};

export default function SiteShell({ activePage, topbarTitle, children }: SiteShellProps) {
  const topbarHref =
    activePage === "whois" ? "/whois-checker" : activePage === "generator" ? "/domain-name-generator" : "/";

  return (
    <main className="theme-page">
      <header className="theme-topbar">
        <div className="theme-brand">
          <Link className="theme-brand-name" href="/">
            Bulk Domain Checker
          </Link>
        </div>
        <Link className="theme-topbar-title" href={topbarHref}>
          {topbarTitle}
        </Link>
      </header>

      <div className="theme-main">
        <div className="theme-shell">
          <nav className="nav-row">
            <Link className={activePage === "checker" ? "nav-item active" : "nav-item"} href="/">
              Checker
            </Link>
            <Link className={activePage === "generator" ? "nav-item active" : "nav-item"} href="/domain-name-generator">
              Domain Name Generator
            </Link>
            <Link className={activePage === "whois" ? "nav-item active" : "nav-item"} href="/whois-checker">
              WHOIS Checker
            </Link>
          </nav>

          {children}
        </div>
      </div>
    </main>
  );
}
