"use client";

import Link from "next/link";
import { ReactNode } from "react";

type SiteShellProps = {
  activePage: "checker" | "generator";
  topbarTitle: string;
  children: ReactNode;
};

export default function SiteShell({ activePage, topbarTitle, children }: SiteShellProps) {
  return (
    <main className="theme-page">
      <header className="theme-topbar">
        <div className="theme-brand">
          <Link className="theme-brand-name" href="/">
            Bulk Domain Checker
          </Link>
        </div>
        <Link className="theme-topbar-title" href="/domain-name-generator">
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
          </nav>

          {children}
        </div>
      </div>
    </main>
  );
}
