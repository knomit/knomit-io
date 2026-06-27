# knomit.io Messaging Overhaul — Design

**Date:** 2026-06-25
**Status:** Approved (brainstorming) — ready to implement
**Supersedes:** the positioning in `local/knomit-site/03-messaging.md` ("Git-backed
memory for AI agents"). The site IA and visual system are unchanged; only the
**message** is rewritten.

## Why this overhaul

The first build pitched knomit as **"memory for AI agents."** That undersells and
misframes it. knomit is a **distributed, decentralized knowledge management
system** whose value is the **quality and actionability of knowledge** — not an
agent's private memory, and not document ingestion (RAG).

Two corrections drive everything:

1. **Peer-symmetric.** Humans and machines are equal peers — pun intended,
   knomit. Neither is "primary." Reduced token waste is a *consequence* of
   accurate, traceable knowledge, never the headline.
2. **Facts, not documents.** "Distributed knowledge management" must not read as
   chunk-and-embed RAG. Knowledge is represented as **concise, categorized,
   classified facts** that carry confidence, relate to each other, **evolve**, and
   give birth via discovery to **new** facts.

## Positioning & one-liners

- **Category:** a distributed, decentralized knowledge management system.
- **Tagline (keep):** "Knowledge + commit."
- **Descriptor (replaces the old one):** "A distributed, decentralized knowledge
  base — built from facts, not documents."
- **Hero H1:** "Learn it once. Everywhere knows."
- **Hero sub:** "A distributed, decentralized knowledge base built from concise,
  typed facts — not ingested documents. Each fact carries confidence, provenance,
  and relationships; facts evolve, and discovery gives birth to new ones. Every
  peer — human or agent — learns on its own branch and converges by merge."

## The narrative (the "whys")

1. Decisions are only as good as the facts behind them — knowledge quality *is*
   the product.
2. Distributed learning is becoming mandatory as token usage climbs — peers can't
   re-derive what another already knows.
3. Knowledge drifts — converge it with agentic *and* human input.
4. Trust needs proof — a source of truth about *what is* and *how you got there*.

## "Facts, not documents" (foundational section, leads after the hero)

Knowledge is **not** chunked text in a vector store. It's **facts** — atomic
claims, each:

- **concise & categorized** — placed in an ontology (topic / category), tagged by
  domain + entities;
- **classified by kind** — epistemic (what *is*) vs pragmatic (what to *do*), plus
  a leaf type;
- **confidence-bearing** — a degree of belief that can rise and fall;
- **related** — linked to other facts via provenance refs, forming a graph;
- **evolving** — revised, subsumed, retracted over time;
- **generative** — discovery distills and spawns new facts.

The existing FactCard motif is the visual anchor for this section.

## The eight pillars (replace the old six "feature highlights")

Each maps to a real capability and a knomit-kb designer principle. **All 8 appear
on the landing grid; /concepts carries the depth.**

1. **Facts, not documents** — atomic, typed (epistemic/pragmatic),
   confidence-bearing units — not chunked text.
2. **Never learn the same thing twice** — dedup subsumes; it never appends.
3. **Distributed by computing** — no two peers pay the same learning cost.
4. **Provable provenance** — every fact a signed commit; trace and verify the chain.
5. **Knowledge that evolves** — facts change over time; query the graph as-of any point.
6. **Discovery compounds** — synthesis distills higher-order facts; hypotheses extend them.
7. **Self-describing & clustered** — ontology, domains, entities; facts cluster by
   meaning *and* classification.
8. **Autonomy with consensus** — each peer works on its own branch; converge on
   `main` by merge.

## Audiences (peer-symmetric)

- Teams where people and agents build shared knowledge together.
- AI engineers running agent fleets that must share learning, not silo it.
- Anyone needing a provable, versioned, ontological alternative to wikis and
  opaque vector stores.

## Differentiators

- **vs centralized KM (wikis, Notion, knowledge graphs):** decentralized,
  branch-per-peer, converge by merge; full provenance; time-travel.
- **vs per-agent vector memory / RAG:** typed, ontological, provable, mergeable —
  shared, not a siloed opaque blob. Facts, not chunked documents. (Embeddings stay,
  positioned as *complementary* semantic search over a transparent substrate.)

## Words

- **Prefer:** fact, typed, epistemic/pragmatic, confidence, evolve, discovery,
  distributed, decentralized, peer, converge, consensus, provenance, traceable,
  ontology, cluster, drift, actionable, source of truth, as-of.
- **Avoid as the lead:** "memory", "goldfish", "durable memory for agents",
  "stateless agents", and anything that reads as document ingestion / RAG.

## Scope of changes (IA stays; framing is rewritten)

- **`src/lib/site.ts`** — descriptor/tagline constants.
- **Landing (`index.astro`)** — new hero; new "Facts, not documents" section;
  problem reframed ("knowledge is siloed, unprovable, re-learned, and drifts");
  features → 8 pillars; how-it-works + demo teaser reframed to converge-across-peers.
- **`FeatureGrid` / `Icon`** — support 8 pillars; add glyphs for discovery,
  evolve/confidence, facts, cluster as needed.
- **`/concepts`** — promote distributed/peers/consensus; add epistemic-vs-pragmatic
  and clustering (currently missing).
- **`/use-cases`** — reframe peer-symmetric; lead with distributed team knowledge
  and multi-peer consensus; "agent memory" demoted to one angle.
- **Blog** — reframe the seed post and the candidate angle list.
- **Docs** — intro + concepts page adopt the new thesis; quick-start/reference
  factually unchanged.
- **Global** — footer subline, every page's meta description, and the OG image
  (`scripts/make-og.mjs` + regenerate `public/og.png`).

## Out of scope

Visual system, color tokens, fonts, component architecture, build/sync/deploy,
docs reference accuracy — all unchanged. No new dependencies.

## Verification

`npm run build` (88+ pages), `npm run check` (0 errors), `npm test` (smoke
suite). Update any smoke assertions that pin old hero copy. Re-screenshot the
landing, the new facts section, /concepts, and /use-cases.
