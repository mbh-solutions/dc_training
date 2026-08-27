# Repository Agent Contract

## S11 PR #67 temporary qualification override

- For PR #67 only, owner issue `mbh-solutions/supportability-gate#154` requires one frozen review
  head with exactly eight serial focused reviews in order `1` through `8`.
- Supported remediation may create one descendant final head. Completed focuses are not repeated;
  only deterministic gates rerun on that final head.
- These two rules supersede conflicting three-focus and new-push clauses below for PR #67 only.
  They do not change production policy or any other pull request.

## Required Codex review completion

- For every pull-request head and organization-required workflow run, post exactly three
  owner-authenticated comments, one at a time in focus order `2`, `4`, then `8`.
- Each comment must contain the exact focus command below plus
  `Codex-Review-Focus: <focus>`, `Codex-Review-Head: <40-character-head-sha>`, and
  `Codex-Review-Run: <workflow-run-id>` on separate lines:
  - `2`: `@codex review for mixed responsibilities or unclear single ownership in changed code only`
  - `4`: `@codex review for weak domain ownership, low cohesion, avoidable coupling, or unjustified module boundaries only`
  - `8`: `@codex review for unsupported, contradictory, stale, incomplete, or misleading handoff claims about change, boundaries, validation, risk, or gate coverage only`
- Post the next focus only after the connector completes the prior focus. A generic request, an
  out-of-order request, or one completion artifact reused across focuses does not count.
- A clean summary or submitted review counts only after the exact-run observer logs that focus and
  request comment ID while connector eyes are present. The Gate then binds one unique completion
  artifact to each focus through serial request windows and bounded final polling.
- A new push requires three new exact-head/run requests. Do not reuse or edit earlier requests.
- Do not merge until `Supportability Gate` is green and every inline finding is addressed, replied to with fix evidence, and resolved.
