# Bitbucket Query — Feature Backlog

---

### Tab Behavior Config + Per-Query Override
Default behaviour (new tab vs same tab) controlled by a config flag. Can be overridden per query with `SAME` or `NEW` keywords at the end.

- `CONFIG TAB NEW` / `CONFIG TAB SAME` → set the default
- `repo BRANCH main NEW` → force open in new tab
- `repo BRANCH main SAME` → force open in same tab

Notes: Config stored in `chrome.storage.local`. Applies to all navigation commands. Override keywords appended at the end of any query.

---

### Repo Aliases
Assign a short alias to a long repo name so you don't have to type it every time.

- `ALIAS set fe my-very-long-frontend-repo-name` → `fe` now resolves to the full repo name
- `ALIAS remove fe`
- `ALIAS list` → show all aliases as a notification
- `fe BRANCH main` → works like `my-very-long-frontend-repo-name BRANCH main`

Notes: Alias map stored alongside macro data. Resolved before query parsing. Particularly useful in orgs with verbose repo naming conventions.

---

### Clone URL to Clipboard
Copy clone URL without opening a tab.

- `repo CLONE` / `repo CLONE SSH` / `repo CLONE HTTPS`

URLs:
- SSH: `git@bitbucket.org:{{workspace}}/{{repo}}.git`
- HTTPS: `https://{{workspace}}@bitbucket.org/{{workspace}}/{{repo}}.git`

Notes: Use `navigator.clipboard.writeText()` + Chrome notification as confirmation.

---

### Export / Import Cache
Back up and restore the full local storage as JSON.

- Export → downloads `bql-backup.json`
- Import → restores from a JSON file

Notes: Helps when reinstalling or switching devices.
