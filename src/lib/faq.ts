export interface FaqItem {
  q: string;
  a: string;
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    q: 'What is knomit?',
    a: 'knomit is git-backed memory for AI agents: a distributed, decentralized knowledge base built from concise, typed facts rather than ingested documents. Each fact is a markdown file carrying a kind (epistemic or pragmatic), a confidence score, an ontology path, and signed-commit provenance. Humans and agents both read and write it, and converge on a shared main branch.',
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
    q: 'Is knomit open source?',
    a: 'Yes. knomit is open source and the store is a plain git repository, so you can inspect it, diff it, review changes like code, and host it anywhere — locally or on a git host such as GitHub.',
  },
  {
    q: 'What is MCP and how does knomit use it?',
    a: 'MCP (Model Context Protocol) is the open protocol agents use to call external tools. knomit is MCP-native: it exposes tools like knomit_learn, knomit_query, and knomit_explain so a model can recall knowledge before it acts and learn as it works, directly inside Claude Code, an editor, or any MCP client — no prompt scaffolding required.',
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
    q: 'Where can I run knomit?',
    a: 'knomit ships three binaries: a server (knomit), a desktop tray app (knomit-desktop), and a bridge (knomit-bridge) that proxies MCP over stdio into clients like Claude Code and Claude Desktop. It runs on macOS, Linux, and Windows.',
  },
];
