# Bitbucket Query Language (BQL)

A Chrome extension that lets you navigate Bitbucket repositories using a keyboard-driven query language from the browser's address bar. No more clicking through menus — just type `open` and go.

---

## Installation

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the repository folder.
5. The extension installs and opens the help page automatically.

---

## How It Works

Type `open` in the Chrome address bar (omnibox) to activate BQL, then type a command. As you type, contextual suggestions appear based on your cached Bitbucket data.

BQL passively scrapes data from Bitbucket pages you visit — workspaces, repositories, branches, commits, PRs, pipelines, and deployments — and stores it locally. This cached data powers the autocomplete suggestions.

---

## Commands

### Workspace

| Command | Description |
|---|---|
| `SET workspace-name` | Set the active (default) workspace |
| `LIST` | Open repository list for the active workspace |
| `LIST workspace-name` | Open repository list for a specific workspace |
| `HELP` | Open this help/documentation page |

### Repository Navigation

All repo commands use the active workspace. Format: `repo-name [sub-command]`

| Command | Opens |
|---|---|
| `repo-name` | Repository overview |
| `repo-name BRANCH` | Branches list |
| `repo-name BRANCH branch-name` | Branch source code |
| `repo-name BRANCH branch-name COMMIT` | Commit history of the branch |
| `repo-name BRANCH branch-name COMMIT commit-id` | Specific commit |
| `repo-name TAG tag-name` | Tag source code |
| `repo-name TAG tag-name COMMIT` | Commit history of the tag |
| `repo-name TAG tag-name COMMIT commit-id` | Specific commit |
| `repo-name COMMIT` | Commit history (default branch) |
| `repo-name COMMIT commit-id` | Specific commit |
| `repo-name PR` | Pull requests list |
| `repo-name PR pr-number` | Specific pull request |
| `repo-name PIPELINE` | Pipelines list |
| `repo-name PIPELINE pipeline-no` | Specific pipeline run |
| `repo-name DEPLOY` | Deployments list |
| `repo-name DEPLOY environment-name` | Specific deployment environment |
| `repo-name COMPARE branch-a TO branch-b` | Compare two branches/tags |
| `repo-name DIFF branch-name` | Diff branch against default branch |
| `repo-name DIFF branch-a TO branch-b` | Diff two branches/tags |

### Macros

Macros let you run the same command across multiple repositories at once.

| Command | Description |
|---|---|
| `MACRO` | List all macros (shown as a notification) |
| `MACRO NEW macro-name` | Create a new macro |
| `MACRO REMOVE macro-name` | Delete a macro |
| `MACRO LIST macro-name` | List repositories in a macro |
| `MACRO EDIT macro-name REMOVE repo-name` | Remove a repo from a macro |
| `MACRO macro-name` | Open overview of all repos in the macro |
| `MACRO macro-name BRANCH branch-name` | Open a branch across all repos in the macro |
| `MACRO macro-name PR` | Open PRs across all repos in the macro |
| *(any repo sub-command works with MACRO)* | Runs that command on every repo in the macro |

**Adding repos to a macro:** Right-click any Bitbucket repository link or page and select **"Add this repo to macro"**, then pick the target macro.

> **Macro name rules:** Only lowercase letters (`a-z`), digits (`0-9`), and hyphens (`-`) are allowed.

---

## Data Caching

BQL caches Bitbucket data automatically as you browse:

- **Workspaces** → discovered when visiting workspace overview pages
- **Repositories** → scraped from workspace repository listing pages
- **Branches / Tags / Commits** → scraped from branch, tag, and commit pages
- **Pull Requests** → scraped from PR list and detail pages
- **Pipelines** → scraped from pipeline list and result pages
- **Environments** → scraped from deployment pages

Cached items are sorted by **last used time**, so the most recently accessed items appear first in suggestions.

All data is stored in Chrome's local extension storage and never leaves your browser.

---

## Upcoming Features

- Open a specific source file in a repository
- Open a source file at a specific line number
- Open a source file at a specific line number and column

---

## Bug Fixes & Improvements (Changelog)

### v1.1.x

- Fixed `DEPLOY` environment suggestions not appearing in omnibox autocomplete (missing `.map()`)
- Fixed TAG filter always returning all tags due to variable shadowing (`tag => tag.includes(tag)`)
- Fixed `LIST` suggestion showing literal `${bitbucketQueryData.active}` instead of the workspace name (regular string instead of template literal)
- Fixed `MICRO` typo in help page (should be `MACRO`)

---

## Project Structure

```
bitbucket-query/
├── manifest.json      Chrome extension manifest (Manifest V3)
├── commander.js       Service worker: query parsing, suggestions, URL generation, storage
├── solider.js         Content script: DOM scraping on Bitbucket pages
├── help.html          Help/documentation page (opens on install)
├── help.css           Styles for the help page
├── plan.md            Internal planning notes
└── logo*.png          Extension icons (16, 32, 48, 128px)
```

### Architecture

```
[User types in omnibox]
        ↓
  commander.js (service worker)
  - Parses query fragments
  - Looks up cached data
  - Returns suggestions
        ↓
[User selects suggestion / presses Enter]
        ↓
  commander.js
  - Builds Bitbucket URL
  - Opens new tab
        ↓
  solider.js (content script on bitbucket.org)
  - Scrapes page data
  - Sends message to commander.js
  - commander.js stores data in chrome.storage.local
```

---

## Permissions

| Permission | Reason |
|---|---|
| `storage` | Persist cached workspace/repo/branch data locally |
| `notifications` | Notify user of actions (macro operations, errors, confirmations) |
| `contextMenus` | Right-click "Add this repo to macro" on Bitbucket pages |

---

## Contributing / Feedback

Feel free to connect and share feedback at [rpkr.in](https://rpkr.in/).

Issues and suggestions are welcome.

---

*Built with love by [RPKR](https://rpkr.in/) &copy; 2024*
