# Repository Agent Contract

## Owner-opt-in Codex review

Codex review is owner opt-in only. An agent may post `@codex review` only when the owner explicitly
requests it in the current task. A push, check failure, timeout, missing acknowledgement, or earlier
review request never authorizes an automatic request, retry, or blocking wait. Codex review is
advisory and is never required for qualification, merge, or completion. If an owner-requested
review creates an inline conversation, resolve that conversation through GitHub's native
review-thread resolution before merge.
