# Contributing to this project's AI context

How to add or change the context the AI relies on here. For authoring AIDD skills, agents, rules, and templates, see the framework guide: <https://github.com/ai-driven-dev/framework/blob/main/CONTRIBUTING.md>.

## Changing project memory

Add or edit a file under `aidd_docs/memory/`. See [`memory/README.md`](memory/README.md) for what belongs there and how it loads.

## Adding AI content (skills, rules, agents, commands, hooks)

- Use the generator skills (`aidd-context:04-skill-generate` through `08-hook-generate`, and `10-learn` for memory or rules). They scaffold the right shape and write to the right place for each tool you use.
- Ce dépôt est solo (un seul contributeur, `xnooztvFR`) : pas de revue formelle par PR pour les changements de contexte IA, mais rester cohérent avec les conventions déjà décrites dans `CLAUDE.md`.

## House conventions

- Le contexte projet vit dans `CLAUDE.md` (racine) pour les instructions détaillées de build/release/architecture, et dans `aidd_docs/memory/` pour les faits durables non dérivables du code (décisions, gotchas).
- Ne pas dupliquer dans `aidd_docs/memory/` ce qui est déjà documenté dans `CLAUDE.md` — pointer vers la section concernée plutôt que copier.
