# Rules

## Relational map rule

Every feature built or changed refreshes `docs/relational-map/` in the
same change; a feature is not landed until the diagram matches the code.

- If a change adds, removes or rewires a component, connection, table,
  entry point, external service or hosting shape, update the affected
  map file(s) — and the overview diagram in
  `docs/relational-map/00-overview.md` when the whole-system picture
  changes — in the same pull request.
- `docs/MAP.md` stays a short pointer to the map; the detail lives in
  `docs/relational-map/`.
