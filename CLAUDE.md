# CLAUDE.md

<!-- security-incident:start -->
## Security incident: EtherHiding malware injection (2026-09 and 2026-10)

This repo was hit twice by a build-time malware injector pushed with a stolen GitHub login: first on 2026-09-01,
then on 2026-10-19 to 2026-10-21. Both waves were cleaned on 2026-10-21. The pusher ran on a **Windows machine**
(it hid `temp_auto_push.bat`, `temp_interactive_push.bat` and `config.bat` via `.gitignore`).
**Git history still contains the payloads**, so checking out, merging, rebasing or cherry-picking a commit from
before the cleanup brings them back.

### Rules for agents and humans
1. **Before any `install`, `build`, `test`, `dev`, deploy or push, run the scan. A non-zero exit means infected:
   stop and tell the owner immediately. Do not build, do not "fix it quietly".**
   ```bash
   bash scripts/security/malware-scan.sh
   ```
2. Once per clone, install the pre-push hook (it scans what you push and rejects injector-fingerprinted commits):
   ```bash
   bash scripts/security/install-hooks.sh
   ```
3. The `malware-scan` GitHub Actions check runs on every push and pull request. Never merge while it is red.
4. Never edit or delete anything in `scripts/security/` or `.github/workflows/malware-scan.yml` to make a check pass.
5. Do not use `git push --no-verify` unless the owner explicitly asks.

### What the injection looks like (any one of these)
- A 13-26KB obfuscated line appended after hundreds of spaces to a `postcss`/`eslint`/`babel`/`tailwind`/`jest`
  config, often with a `createRequire` shim prepended.
- A root `api.js` that is all obfuscated code, plus `package.json` scripts rewritten to `node api.js && ...`.
- `.vscode/tasks.json` with a hidden `runOn: folderOpen` task running a fake font
  (`public/fonts/fa-solid-500.woff2`, `fa-solid.lkf`, `fa-brand-400.woff`) that is really JavaScript, plus
  `task.allowAutomaticTasks: true` in `.vscode/settings.json` and a decoy Font Awesome folder.
- `next.config.ts` (or a script) gaining an `(async () => { atob(process.env.AUTH_API_KEY) ... eval(...) })()`
  block, with `"dotenv": "^8.2.0"` / `"node-fetch": "^3.3.2"` added to `package.json`.
- A `.env` with `AUTH_API_KEY="aHR0c..."` (base64 of the C2 `https://auth-confirm-eight.vercel.app/api`).
- A committed `branch_structure.json` (the injector's branch map) and `.gitignore` entries removed or added.

### Spotting injector commits
They keep the real author line but are **committed from a `-07:00`/`-08:00` host whose offset differs from the
author's**, usually by a shortened name ("Adi" instead of "Adi Alia"), and often copy earlier genuine
"security: remove ..." messages. Dates are faked; check with `git log --format='%aI %cI %an %cn %ce'`, not the GitHub UI.
<!-- security-incident:end -->
