---
description: Draft and execute git commit commands that follow the Conventional Commits spec. Use when asked to write a commit message, prepare git commit -m arguments, keep message lines at 72 characters, or avoid Co-authored-by trailers unless explicitly requested.
metadata:
    github-path: skills/conventional-commits
    github-ref: refs/heads/main
    github-repo: https://github.com/orrisroot/agent-skills
    github-tree-sha: db6200ed40cce57f94a52bc534c21aa89ffc0a52
name: conventional-commits
---
# Conventional Commits

Write commit messages in English and format them for `git commit`.

## When to Use This Skill

- The user asks for a conventional commit message
- The user wants a ready-to-run `git commit` command
- The task needs a short subject plus a wrapped body
- The user wants to avoid unwanted commit trailers

## Required Rules

Follow these rules every time:

1. Use the Conventional Commits format:
   `<type>(<optional-scope>): <subject>`
2. Keep every commit message line at 72 characters or fewer.
3. Write the message in English unless the user explicitly asks for
   another language.
4. Use `git commit -m` to pass the message.
5. For multiline messages, use one `-m` for the subject and additional
   `-m` flags for body paragraphs.
6. Rewrite long body text into shorter sentences so each message line
   stays within 72 characters.
7. Do not open an editor, use a here-doc, or write the message to a
   temporary file.
8. Do not add a `Co-authored-by` trailer unless the user explicitly
   asks for it for that specific commit.

## Workflow

1. Identify the change being committed.
2. Choose the best conventional commit type, such as `feat`, `fix`,
   `docs`, `refactor`, `test`, `build`, or `chore`.
3. Write a concise subject that explains the change.
4. If a body is needed, add clear paragraphs that explain why the
   change was made and any important impact.
5. Check every subject and body line and revise anything over
   72 characters.
6. Return a ready-to-run `git commit` command that uses `-m` arguments.
7. Add trailers only when the user explicitly requests them.

## Common Patterns

| Situation | Preferred pattern |
| --- | --- |
| New user-facing behavior | `feat:` |
| Bug fix | `fix:` |
| Documentation only | `docs:` |
| Internal cleanup with no behavior change | `refactor:` |
| Test-only change | `test:` |
| Tooling or dependency updates | `build:` or `chore:` |

## Examples

### Minimal subject only

```bash
git commit -m "docs: add contributing guide"
```

### Feature with body paragraphs

```bash
git commit \
  -m "feat(auth): add refresh token rotation" \
  -m "Rotate refresh tokens after each successful renewal." \
  -m "Reduce replay risk and simplify token revocation tracking."
```

### Fix with short body paragraphs

```bash
git commit \
  -m "fix(api): handle empty search query" \
  -m "Return a validation error when the query string is empty." \
  -m "This keeps downstream filters from running on invalid input."
```

### Breaking change with explicit body

```bash
git commit \
  -m "refactor(config): rename cache ttl setting" \
  -m "Rename cache.ttlSeconds to cache.ttl to match runtime usage." \
  -m "BREAKING CHANGE: update deployment configs before release."
```

### When the user explicitly asks for a trailer

Only then add it:

```bash
git commit \
  -m "fix(ui): prevent duplicate submit" \
  -m "Disable the submit button while the request is in flight." \
  -m "Co-authored-by: Example User <example@example.com>"
```

## Final Checks

Before presenting the command:

- confirm the commit type matches the change
- confirm each message line is 72 characters or fewer
- confirm the command uses `-m` arguments for multiline messages
- confirm no `Co-authored-by` trailer appears unless requested
