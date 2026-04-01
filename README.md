# Bulk Domain Checker

Bulk Domain Checker is a small Next.js application for two related tasks:

- checking a batch of domain names from a single input
- generating `.com` domain suggestions from a single search term

The project is designed as a simple self-hosted tool. It uses DNS as the first signal for registration and falls back to RDAP when DNS does not confirm the domain state.

## Features

- Bulk domain checker for up to 15 domains per request
- Domain Name Generator based on a curated word list
- DNS-first availability checks
- RDAP fallback when DNS is inconclusive
- One-hour in-memory caching for generated suggestions and availability results
- Result modals with NameSilo affiliate links for available domains

## Stack

- Next.js 14
- React 18
- TypeScript

## Local Development

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Start the production build:

```bash
npm run start
```

## How Availability Checking Works

The availability flow lives in [`lib/domain-utils.ts`](./lib/domain-utils.ts).

1. The input domain is normalized and validated.
2. DNS record lookups are attempted first.
3. If DNS confirms the domain is registered, the result is marked as unavailable.
4. If DNS does not confirm registration, the app queries RDAP.
5. If RDAP returns a clear registered or not-registered result, that result is used.
6. If RDAP is limited or unavailable, the UI can still surface the domain as available with a note marker.

This is a practical heuristic, not a registrar-grade source of truth. If a result matters commercially, confirm it before purchase.

## Domain Generator

The generator route lives in [`app/api/suggest-domains/route.ts`](./app/api/suggest-domains/route.ts).

- A cleaned single-word search term is used for generation.
- Suggestions are built from a fixed word list using:
  - `prefix + term`
  - `term + suffix`
- No hyphens are added.
- Suggestions are paginated and checked in batches.

## Project Structure

```text
app/
  api/
    check-domains/
    suggest-domains/
  components/
  domain-name-generator/
  globals.css
  layout.tsx
  page.tsx
lib/
  domain-utils.ts
```

## Notes

- Caches are in memory. They reset when the server restarts.
- The current generator focuses on `.com`.
- The bulk checker accepts mixed extensions.
