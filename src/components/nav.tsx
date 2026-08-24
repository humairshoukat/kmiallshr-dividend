"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="top-nav">
      <Link href="/" className={pathname === "/" ? "active" : ""}>
        Dividend Board
      </Link>
      <Link
        href="/price-hikes"
        className={pathname === "/price-hikes" ? "active" : ""}
      >
        Price Snapshot
      </Link>
    </nav>
  );
}
