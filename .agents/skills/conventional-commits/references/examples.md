# Conventional commit examples

These examples are written in English.
They follow the rules enforced by the `conventional-commits` skill.

## Subject only

```bash
git commit -m "test(parser): cover empty input"
```

## Subject plus explanatory body

```bash
git commit \
  -m "feat(cli): show branch name in status output" \
  -m "Display the current branch before the working tree summary.
Help users confirm context before they stage or commit changes."
```

## Documentation change

```bash
git commit \
  -m "docs(readme): explain skill folder layout" \
  -m "Document the skills/<skill-name>/SKILL.md convention and keep
the repository ready for additional Agent Skills."
```

## Dependency or tooling update

```bash
git commit \
  -m "chore(deps): update commitlint presets" \
  -m "Align local commit checks with the repository commit rules."
```

## Trailer omitted by default

Do not append `Co-authored-by` unless the user explicitly asks for it.
Use another `-m` only when the final commit message should contain a
blank line before the next paragraph.
