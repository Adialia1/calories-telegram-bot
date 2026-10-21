# CLAUDE.md

<!-- security-incident:start -->
## Security incident: EtherHiding malware injection (2026-09 and 2026-10)

This repo was hit twice by a build-time malware injector pushed with a stolen GitHub credential:
first on 2026-09-01, then on 2026-10-19 to 2026-10-21. Both waves were cleaned with forward commits, the last on 2026-10-21.
**Git history still contains the payloads**, so checking out, merging, rebasing or cherry-picking a commit from
before the cleanup brings them back. Never build or run an old commit or branch without scanning it first.

**Before any `npm install`, `npm test`, `vitest`, `next build`, `dev` or deploy, run this. Any output means infected: stop.**

```bash
git grep -nIP '[ \t]{200,}[^ \t\r\n].{999,}' -- . ':!*.md' ':!*.map' | cut -c1-120   # payload hidden off-screen
git grep -nI 'folderOpen' -- '*tasks.json'                                             # VS Code autorun task
git grep -nI 'allowAutomaticTasks' -- '*settings.json'
git grep -nIE '"node [^"]*api\.js' -- '*package.json'                                   # script hook
git grep -nIE '="?aHR0c' -- '*.env' '.env*'                                             # base64 C2 URL
```

What the injection looks like (any one of these):
- A ~13-26KB obfuscated line appended after hundreds of spaces to `postcss`/`eslint`/`babel`/`tailwind`/`jest` configs,
  often with a `createRequire` shim prepended.
- A root `api.js` that is entirely obfuscated code, plus `package.json` scripts rewritten to `node api.js && ...`.
- `.vscode/tasks.json` with a hidden `runOn: folderOpen` task running `node ./public/fonts/fa-solid-500.woff2`
  (or `fa-solid.lkf`, `fa-brand-400.woff`): a fake font that is really JS. Decoy real Font Awesome files sit next to it.
- `.vscode/settings.json` gaining `task.allowAutomaticTasks: true`, `debug.openDebug: neverOpen`,
  `terminal.integrated.hideOnStartup`.
- A `.env` with `AUTH_API_KEY="aHR0c..."` (base64 of the C2 `https://auth-confirm-eight.vercel.app/api`), and
  `.gitignore` entries for `.env`/build output deleted.

Telling injector commits apart: they keep the real author line but are **committed by "Adi"** (not "Adi Alia")
with a `-07:00`/`-08:00` offset, and commit messages often copy earlier genuine "security: remove ..." commits.
Dates are faked, so use `git log --format='%aI %cI %an %cn %ce'`, not the GitHub UI, which normalizes offsets.

If you find it: do not build. Remove the payload (truncate at the whitespace run, delete the pure-payload files,
undo the script hook and VS Code settings), re-run the checks above, and tell the owner immediately: it means the
credential is live again. Check for a running beacon with `ps -axo pid,command | grep -E "node +-e"`.
<!-- security-incident:end -->
