# Repository Agent Contract

## Required Codex review completion

- For the frozen review head and organization-required workflow run, post exactly eight
  owner-authenticated comments, one at a time in focus order `1` through `8`.
- Each comment must contain the exact focus command below plus
  `Codex-Review-Focus: <focus>`, `Codex-Review-Head: <40-character-head-sha>`, and
  `Codex-Review-Run: <workflow-run-id>` on separate lines:
  - `1`: `@codex review for maze-like control flow, misleading extraction, or helpers that lower measured complexity without improving readability, testability, or naming in changed code only`
  - `2`: `@codex review for mixed responsibilities or unclear single ownership in changed code only`
  - `3`: `@codex review for unclear, inverted, cyclic, or unjustified dependency direction across changed boundaries only`
  - `4`: `@codex review for weak domain ownership, low cohesion, avoidable coupling, or unjustified module boundaries only`
  - `5`: `@codex review for missing, weak, misleading, or nondeterministic characterization of behavior at risk from this change only`
  - `6`: `@codex review for oversized, non-runnable, big-bang, or insufficiently bounded refactor steps in this change only`
  - `7`: `@codex review for validation evidence that omits changed or high-risk behavior, weakens scope or thresholds, hides failures, or overstates what ran only`
  - `8`: `@codex review for unsupported, contradictory, stale, incomplete, or misleading handoff claims about change, boundaries, validation, risk, or gate coverage only`
- Post the next focus only after the connector completes the prior focus. Each focus requires one
  unique trusted completion artifact observed by the exact-run observer.
- After remediation, reuse the completed lifecycle; do not post another review request.
- Do not merge until `Supportability Gate` is green and every inline finding is addressed, replied
  to with evidence, and resolved.
