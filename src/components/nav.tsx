"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./ui-icon";

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="top-nav" aria-label="Main navigation">
      <div className="nav-inner">
        <Link href="/" className="brand" aria-label="KMI Income home">
          <span className="brand-mark"><Icon name="chart" /></span>
          <span>KMI<span className="brand-divider">/</span><span className="brand-name">Income</span></span>
        </Link>
        <div className="nav-links">
          <Link href="/" className={pathname === "/" ? "active" : ""} aria-current={pathname === "/" ? "page" : undefined}>
            <Icon name="grid" /> Dividend board
          </Link>
          <Link href="/price-hikes" className={pathname === "/price-hikes" ? "active" : ""} aria-current={pathname === "/price-hikes" ? "page" : undefined}>
            <Icon name="chart" /> Price snapshot
          </Link>
        </div>
        <span className="nav-market"><span className="status-dot" />Pakistan Stock Exchange</span>
      </div>
    </nav>
  );
}
