<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Financial data sources

- Get and verify dividend data only from PSX's own payout tables and announcement sheets.
- Do not use company financial reports, annual reports, or other company files to obtain or verify dividends, including company files hosted on PSX.
- Consult company files only when necessary to verify the exact current face value of a stock or share. Prefer PSX's current official par-value quotations when sufficient.
- PSX-hosted company profile pages and their payout feeds are PSX data sources. They are distinct from company reports and attachments.

## Production deployments

- Make changes on `main` and show the local view for review. Do not push or deploy until the user explicitly asks.
- Deploy production from `main` only. Never deploy a feature branch or unmerged local changes to production.
- Use the Vercel Git integration so pushes and merges to `main` deploy automatically to `https://kmiallshr-dividend.vercel.app`.
- Before a manual production deployment, fetch `origin` and verify that the working tree is clean and `HEAD` matches `origin/main`.
