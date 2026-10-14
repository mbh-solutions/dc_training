# Documentation maintenance

`README.md` is the repository entry point. `docs/wiki/*.md` is the canonical source for this wiki, including Home, sidebar, and footer. GitHub stores the published wiki in a separate Git repository; merging the application repository does not publish wiki pages.

## Edit and publish

1. Check the actual source, tests, and configuration for the subject. Describe the behavior readers can use. Keep plans and historical implementation notes out of product instructions.
2. Edit the relevant page under `docs/wiki`. Give each detailed subject one home and link to it from other pages. Keep the README short and task-oriented.
3. Check every page link and repository source link. Check examples and command prerequisites. Render Mermaid diagrams and inspect the pages on GitHub; a valid text file alone does not prove rendering.
4. Review both reading paths: can an owner finish a useful task, and can a maintainer diagnose and operate the app? Remove duplicate explanations and change-history wording.
5. Merge the documentation through a protected PR. From a clean, synchronized `main`, publish exactly those files to the wiki checkout.

For a first wiki checkout, run this in PowerShell from the parent directory containing `dc_training`:

```powershell
git clone https://github.com/mbh-solutions/dc_training.wiki.git dc_training.wiki
```

For publication, run from that same parent directory. These folder names refer to the application and wiki checkouts; adjust them to your actual paths.

```powershell
git -C dc_training status --short
git -C dc_training pull --ff-only
git -C dc_training.wiki status --short
git -C dc_training.wiki pull --ff-only
Copy-Item dc_training\docs\wiki\*.md dc_training.wiki\
git -C dc_training.wiki diff --check
git -C dc_training.wiki diff --stat
git -C dc_training.wiki add -- '*.md'
git -C dc_training.wiki commit -m "Publish DC Training documentation"
git -C dc_training.wiki push
```

Stop before copying if either checkout has unrelated changes or a pull fails. Inspect the full wiki diff before committing. Copying does not remove obsolete pages; review any proposed deletion individually and repair incoming links. If nothing changed, there is nothing to commit.

After pushing, open Home, follow the sidebar, inspect every changed page and diagram, and confirm the README links reach the published wiki. Compare the wiki files with `docs/wiki` to detect accidental edits in only one place. Keep credentials and personal workout data out of documentation examples.

## Keep statements durable

Use present-tense instructions and precise limits. Avoid release summaries, dated test totals, and claims that a past verification guarantees future health. Refer to source modules and verification procedures instead of copying their implementation into several pages. Git history and pull requests retain change history.
