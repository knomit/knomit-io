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
    a: 'A distributed, decentralized knowledge distillation factory. Many agents and many knowledge bases are connected so that what one of them learns is accumulated, distilled and used by the rest, as typed facts in signed git commits.',
  },
  {
    q: 'Is knomit only for coding agents?',
    a: 'No. A fact can be about anything. Public knomit corpora cover agentic engineering and AI and cybersecurity; a codebase is one kind of knowledge base among many.',
  },
  {
    q: 'Is knomit open source?',
    a: 'Not under the OSI definition. knomit is source-available under the Functional Source License (FSL-1.1-ALv2): the code is public, and the store is an ordinary git repository you can clone, diff and review like code. Each release becomes Apache 2.0 two years after it ships.',
  },
];

export const FAQ_ITEMS: FaqItem[] = [
  {
    q: 'What is knomit?',
    a: 'knomit is a distributed, decentralized knowledge distillation factory: a fabric that connects many agents and many knowledge bases, so that what any one of them learns is accumulated, distilled and put to use by all of them. Learning is paid once across the network instead of once per agent. The unit is a fact: a concise, typed claim in a markdown file with a kind (epistemic or pragmatic), a confidence, an ontology path, refs, and signed-commit provenance. Each agent writes on its own git branch, and the knowledge converges on a shared main.',
  },
  {
    q: 'Is knomit only for coding agents?',
    a: 'No. The fact model is domain-agnostic: a knowledge base can hold facts about a codebase, a market, a supply chain or a research field, and a participant can be a coding agent, a research agent, an analyst or a team. The public agentic-engineering knowledge base holds hundreds of web-sourced facts on agent security, evaluation, reliability and MCP, and a separate public knowledge base covers AI and cybersecurity. The deepest host integration today is for Claude Code, which is why many examples are about code.',
    more: { href: '/use-cases/', label: 'Use cases beyond code' },
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
    a: 'Yes. An ontology is one YAML file in the knowledge base that declares the topics facts may be filed under, describes each topic to the agent — those descriptions are shipped as MCP instructions, so they are prompt text — and carries validation rules: small JavaScript expressions evaluated against every fact on write, where a failure rejects the fact and shows the agent your message. It can also carry repository policy (consensus, conflict handling, sync mode, signature verification), guidance for review and hypothesize, and triggers. knomit ships three presets: general knowledge, source code, and fleet (for a fleet repository). You can also start a knowledge base from a template, or supply your own ontology when you create it.',
    more: { href: '/docs/ontologies/', label: 'Ontologies' },
  },
  {
    q: 'What are templates and playbooks?',
    a: 'A template is the starting state of a new knowledge base: its ontology, skills, recipes and trigger scripts, plus a README. The templates (general, coding, mission and fleet) live in knomit-playbooks, a public knowledge base of playbooks for programming knomit that an instance subscribes to read-only. Its facts describe each template and each file in it, so an agent can find the right one by querying. You create a knowledge base from a template in the web UI or with "kb repo create <name> --template <repo>/<template>".',
    more: { href: '/docs/templates/', label: 'Templates and playbooks' },
  },
  {
    q: 'Is knomit open source?',
    a: 'Not under the OSI definition. knomit is source-available under the Functional Source License, FSL-1.1-ALv2. You can use, copy, modify and self-host it freely, including for internal commercial use; the one excluded thing is offering knomit, or a substantially similar substitute, to others as a commercial product or service. Two years after each release, that version becomes Apache 2.0. A commercial license is available for anything the FSL does not permit. The store itself is a plain git repository, so you can inspect it, diff it, review changes like code, and host it anywhere.',
  },
  {
    q: 'What is MCP and how does knomit use it?',
    a: 'MCP (Model Context Protocol) is the open protocol agents use to call external tools. knomit exposes twelve MCP tools, among them knomit_learn, knomit_query, knomit_explain, knomit_changes and knomit_experiment, so a model can recall knowledge before it acts and learn as it works. Any MCP client can use them; the kb bridge connects stdio clients such as Claude Code, Antigravity and Claude Desktop to a knomit server.',
    more: { href: '/docs/mcp-tools/', label: 'All twelve MCP tools' },
  },
  {
    q: 'Does knomit work offline?',
    a: 'Yes. knomit runs locally against a plain git repository and uses a local embedding model (EmbeddingGemma over an ONNX runtime) for semantic search, so it needs no external services to read, write, or search facts. Syncing with a git remote is optional.',
  },
  {
    q: 'How does knomit handle multiple agents writing at once?',
    a: 'Each agent writes only to its own git branch, so writers never overwrite each other. Facts reach main, the consensus, in one of two ways: a reviewed merge, or automatically, when a repository sets consensus to auto and its hosting instance merges every branch a peer pushes. Every agent then pulls main and merges it locally, so what one learns, all inherit. Where two agents changed the same fact, the repository can merge the two versions field by field or let the consensus side win; every conflict settled this way is recorded on the merge commit.',
    more: { href: '/docs/sync-and-consensus/', label: 'Sync, consensus and conflicts' },
  },
  {
    q: 'What is a fleet?',
    a: 'A fleet is a set of knomit instances on different machines that work on the same knowledge. Each instance registers with a fleet repository, a knowledge base whose member records list the admitted instances and their current signing keys. Instances can host repositories for each other, accepting pushes over mutual TLS, and a repository can sync in real time. With signature verification on, a commit is accepted into main only when it was signed by an active member with its current key.',
    more: { href: '/docs/fleet/', label: 'Fleets' },
  },
  {
    q: 'What are experiments?',
    a: 'An experiment is a local branch forked from an agent’s own branch. Opening one moves the agent’s session onto it: everything it learns, updates, retracts or reviews goes there. Commit merges the experiment back into the agent branch as a unit; rollback discards it. Experiments are never pushed, so work that may not survive review — facts about a pull request still open, or the output of a review pass — stays private until it is committed. An experiment with no commits for 30 days (configurable) is rolled back automatically.',
    more: { href: '/docs/experiments/', label: 'Experiments' },
  },
  {
    q: 'What are triggers and recipes?',
    a: 'A trigger is a rule in the ontology that fires when facts under a path are learned, updated, retracted, or reach their expiry date. It can emit, run a JavaScript script, push the agent branch at once, or run a recipe. A recipe is a script kept on main or on the machine that can start a process, for example an agent session that takes on a task. Triggers run on the machine that observes the change, on facts that arrived by merge as well as its own. Together they let several machines coordinate through one repository: the mission template uses them so that instances claim tasks written as facts and each task is awarded to one machine.',
    more: { href: '/docs/triggers/', label: 'Triggers and recipes' },
  },
  {
    q: 'How does provenance work?',
    a: 'Every write is one atomic, signed git commit pinned to the exact moment and state of the world in which it was learned. Because the whole graph is versioned by commit, you can trace where a claim came from, who asserted it, how its confidence moved over time, and read the graph as-of any past commit.',
    more: { href: '/blog/retraction-is-not-deletion/', label: 'What a retraction does to what cited it' },
  },
  {
    q: 'What is synthesis in knomit?',
    a: 'Synthesis is knomit\'s pipeline that maintains and grows the corpus: it prunes duplicates, distills higher-order facts from what you already know (RAPTOR-style multi-depth distillation), and reflects on methodology. Hypotheses extend distilled facts forward into falsifiable predictions — knowledge that generates new knowledge. An ontology can carry guidance that tells review and hypothesize what matters in that corpus.',
    more: { href: '/blog/unattended-llm-judges/', label: 'The judges that run the review passes' },
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
    a: 'knomit ships four binaries: the server (knomit), a desktop tray app that runs the server for you (knomit-desktop), the bridge (kb) that connects MCP clients such as Claude Code and Claude Desktop to a server over stdio, and knomit-okf, which publishes a knowledge base as Open Knowledge Format. Releases provide macOS on Apple silicon (arm64) and Linux on x86-64 (amd64), plus a container image on the GitHub Container Registry.',
    more: { href: '/download/', label: 'Download' },
  },
  {
    q: 'Does knomit run on Windows?',
    a: 'Yes, built from source. The server, the desktop app and kb build, pass their tests and run on Windows, where the local listener is a named pipe. Releases do not include Windows binaries yet, so you build them yourself; besides Go and Node.js, the build needs a C compiler with the SQLite header and Rust for one native library.',
    more: { href: '/docs/quick-start/', label: 'Quick start' },
  },
];
