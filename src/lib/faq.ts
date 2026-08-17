export interface FaqItem {
  q: string;
  a: string;
  /** Optional "read more" pointer, rendered as a separate anchor after the
   *  answer. Deliberately NOT inline markup inside `a`: that string is also
   *  the `acceptedAnswer.text` of the FAQPage JSON-LD, and HTML in a schema
   *  text field is markup leaking into structured data. Keeping the link out
   *  of band means the answer reads the same to a person and to a parser. */
  more?: { href: string; label: string };
}

/** Teasers for the homepage block.
 *
 *  Deliberately NOT a slice of FAQ_ITEMS. The homepage previously rendered
 *  `FAQ_ITEMS.slice(0, 5)`, which put five question-and-answer pairs on the
 *  homepage byte-identical to /faq — a third of that page's visible content,
 *  duplicated onto the page it is meant to feed. These are rewritten short
 *  form, not truncations: the answers must differ, or moving the block
 *  achieves nothing.
 *
 *  Only FAQ_ITEMS is marked up as FAQPage JSON-LD, and only on /faq. Do not
 *  add schema for these — two FAQPage blocks competing on the same questions
 *  is the problem this split exists to avoid. */
export const HOME_FAQ_ITEMS: FaqItem[] = [
  {
    q: 'What is knomit?',
    a: 'A distributed knowledge base for AI agents, stored as git. Agents write concise, typed facts instead of dumping documents, and every claim carries provenance you can trace back to the commit that made it.',
  },
  {
    q: 'How is knomit different from RAG or a vector database?',
    a: 'A vector store hands back the chunk of text it matched. knomit hands back the claim itself — typed, scored for confidence, and traceable — and folds a repeated claim into the fact that already exists rather than storing it twice.',
  },
  {
    q: 'Is knomit open source?',
    a: 'Yes, and the store is an ordinary git repository — so you can clone it, diff it, and review knowledge changes in a pull request, like code.',
  },
];

export const FAQ_ITEMS: FaqItem[] = [
  {
    q: 'What is knomit?',
    a: 'knomit is git-backed knowledge for AI agents: a distributed, decentralized knowledge base built from concise, typed facts rather than ingested documents. Each fact is a markdown file carrying a kind (epistemic or pragmatic), a confidence score, an ontology path, and signed-commit provenance. Humans and agents both read and write it, and converge on a shared main branch.',
  },
  {
    q: 'How is knomit different from RAG or a vector database?',
    a: 'RAG and vector databases store chunks of documents and retrieve them by embedding similarity — you get back the original text, not what is true in it. knomit stores atomic, classified facts: two inputs that say the same thing subsume into one fact with multiple references instead of duplicating, and every fact carries confidence and provenance you can trace. Semantic search still works, but over facts, not raw chunks.',
  },
  {
    q: 'What does "facts, not documents" mean?',
    a: 'A fact in knomit is a single atomic claim — an observation, principle, invariant, or decision — written in plain markdown. Instead of embedding whole documents, knomit captures the discrete claims inside them, each one typed, scored for confidence, and linked to its sources and to related facts, forming a graph you can reason over and explain.',
  },
  {
    q: 'Can I define my own ontology?',
    a: 'Yes. An ontology is one YAML file in the knowledge base that declares the topics facts may be filed under, describes each topic to the agent — those descriptions are shipped as MCP instructions, so they are prompt text — and carries validation rules: small JavaScript expressions evaluated against every fact on write, where a failure rejects the fact and shows the agent your message. That makes an ontology more than a folder layout: it decides what counts as a well-formed fact. knomit ships two presets, a general-knowledge taxonomy and a source-code one, and you supply a custom ontology when you create the knowledge base.',
  },
  {
    q: 'Is knomit open source?',
    a: 'Yes. knomit is open source and the store is a plain git repository, so you can inspect it, diff it, review changes like code, and host it anywhere — locally or on a git host such as GitHub.',
  },
  {
    q: 'What is MCP and how does knomit use it?',
    a: 'MCP (Model Context Protocol) is the open protocol agents use to call external tools. knomit is MCP-native: it exposes tools like knomit_learn, knomit_query, and knomit_explain so a model can recall knowledge before it acts and learn as it works, directly inside Claude Code, an editor, or any MCP client — no prompt scaffolding required.',
    more: { href: '/docs/mcp-tools/', label: 'All eight MCP tools' },
  },
  {
    q: 'Does knomit work offline?',
    a: 'Yes. knomit runs locally against a plain git repository and uses a local embedding model (EmbeddingGemma over an ONNX runtime) for semantic search, so it needs no external services to read, write, or search facts. Syncing with a git remote is optional.',
  },
  {
    q: 'How does knomit handle multiple agents writing at once?',
    a: 'Each peer — human or agent — works on its own git branch and never merges another peer\'s branch directly. Facts are reviewed, approved, and merged into main, which is the consensus. Every peer then pulls main and merges it locally, so what one peer learns, every peer inherits.',
  },
  {
    q: 'How does provenance work?',
    a: 'Every write is one atomic, Ed25519-signed git commit pinned to the exact moment and state of the world in which it was learned. Because the whole graph is versioned by commit, you can trace where a claim came from, who asserted it, how its confidence moved over time, and read the graph as-of any past commit.',
  },
  {
    q: 'What is synthesis in knomit?',
    a: 'Synthesis is knomit\'s pipeline that maintains and grows the corpus: it prunes duplicates, distills higher-order facts from what you already know (RAPTOR-style multi-depth distillation), and reflects on methodology. Hypotheses extend distilled facts forward into falsifiable predictions — knowledge that generates new knowledge.',
  },
  {
    q: 'What is a discovered (emergent) fact?',
    a: 'Beyond storing and synthesizing, knomit can discover facts nobody wrote down. An effort dial on review and hypothesize seeds from "bridges" — facts that share a domain or entity yet sit in different similarity clusters — and proposes the keystone those bridges imply. Forward discovery writes a synthesis fact (a consequence); backward discovery writes a hypothesis (an unstated premise), ranked by blast radius. Each carries origin: discovered, so the emergent set is queryable and auditable. Similarity-only retrieval is structurally blind to these cross-cluster links — that is exactly why the facts went unwritten.',
  },
  {
    q: 'Does knomit support the Open Knowledge Format (OKF)?',
    a: 'Yes, as an export target. knomit ships knomit-okf, a standalone CLI that publishes a knowledge base as a portable OKF repository — the open specification Google Cloud published in June 2026, currently at version 0.2. Every bundle is validated against OKF conformance rules before it is committed, so a non-conformant bundle is an error rather than a commit. This is one-way: knomit exports to OKF and does not import from it.',
  },
  {
    q: 'How do I publish a knomit knowledge base as OKF?',
    a: 'Three commands. Run "knomit-okf clone -b main <kb-url> my-kb" against your knomit server\'s git endpoint, add your own git remote and push, then run "knomit-okf sync && git push" whenever the knowledge moves. The tool commits but never pushes, so your remote and credentials stay yours. A sync with nothing to do costs a fetch and about 70 milliseconds, which makes it cheap to run on a timer.',
  },
  {
    q: 'What is the difference between a knomit knowledge base and an OKF bundle?',
    a: 'A knomit KB is the private, agent-shaped original: facts under kb/, one git branch per author, provenance edges, confidence that moves, and an embedding index for semantic search. An OKF bundle is the portable, consumer-shaped publication of it: plain markdown concept documents with standard frontmatter, directory indexes, and a changelog, readable by any conformant tool without knomit involved. knomit-okf is the mapper between them — meaning lands in standard OKF keys, and knomit-specific axes like confidence and origin are preserved alongside under knomit_* rather than discarded.',
  },
  {
    q: 'Where can I run knomit?',
    a: 'knomit ships four binaries: a server (knomit), a desktop tray app (knomit-desktop), a bridge (knomit-bridge) that proxies MCP over stdio into clients like Claude Code and Claude Desktop, and knomit-okf, which publishes a knowledge base as a portable Open Knowledge Format repository. It runs on macOS and Linux.',
    more: { href: '/docs/deployment/', label: 'Deployment guide' },
  },
];
