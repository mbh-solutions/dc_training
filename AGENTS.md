# Repository Agent Contract

## Required Codex review completion

- For every pull-request head and organization-required workflow run, post exactly one owner-authored comment with this form:

  ```text
  @codex review

  Codex-Review-Head: <40-character-head-sha>
  Codex-Review-Run: <workflow-run-id>
  ```

- A new push requires a new exact-head/run request. Do not reuse or edit an earlier request.
- Do not merge until `Supportability Gate` is green and every inline finding is addressed, replied to with fix evidence, and resolved.
