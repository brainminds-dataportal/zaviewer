---
name: git-commit
description: Create Git commit messages for this repository in English using Conventional Commits. Use this when asked to prepare, refine, or review a commit message before running git commit.
license: MIT
---

# Git commit messages

Use this skill when the task is to prepare a commit message for this
repository.

## Goal

Produce a commit message that is:

- Written in English
- Based on the actual diff
- Formatted as a Conventional Commit
- Ready to use with `git commit`

## Commit format

Follow this structure:

```text
<type>(<scope>): <short description>

[optional body]

[optional footer(s)]
```

## Allowed types

- `feat`: a new feature
- `fix`: a bug fix
- `refactor`: a code change that is neither a feature nor a bug fix
- `perf`: a code change that improves performance
- `docs`: documentation changes only
- `test`: adding or updating tests
- `chore`: build process, dependency updates, tooling
- `ci`: CI/CD configuration changes
- `revert`: reverting a previous commit

## Message rules

- Write the subject in the imperative mood
- Do not end the subject with a period
- Keep the subject within 72 characters
- Use a lowercase scope when it helps clarify the affected area
- In the body, explain **what** changed and **why**
- Wrap body lines at 72 characters
- Use real newlines, never literal `\n`
- For breaking changes, add `!` after the type or scope and/or add a
  `BREAKING CHANGE:` footer

## Repository-specific rules

- Base the message on the staged or intended changes, not on plans or
  guesses
- Prefer a scope that matches the main touched area, such as `docker`,
  `admin`, `extension`, `build`, `deps`, or `docs`
- If a co-author trailer is needed, use a generic template and replace it
  with the correct identity for the actual authoring environment:

```text
Co-authored-by: <name> <email>
```

## Recommended workflow

1. Review the diff or staged changes
2. Choose the best Conventional Commit type
3. Add a scope only if it makes the message clearer
4. Write a short subject focused on the resulting change
5. Add a body when context, motivation, or grouped changes need
   explanation
6. Add footers only when required

## Output template

```text
<type>(<scope>): <short description>

<what changed and why>

Co-authored-by: <name> <email>
```

Omit the body or scope when they are unnecessary, but keep the message
valid Conventional Commits text.
