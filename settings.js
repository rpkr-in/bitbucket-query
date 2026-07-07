const DEFAULT_TAB_BEHAVIOUR = 'new';
const STORAGE_KEYS = ['workspaces', 'active', 'macro', 'aliases', 'config'];

let data = {
    workspaces: {},
    active: null,
    macro: {},
    aliases: {},
    config: {tabBehaviour: DEFAULT_TAB_BEHAVIOUR}
};

document.addEventListener('DOMContentLoaded', () => {
    wireStaticControls();
    load();
});

/* Keep the page in sync if the service worker or another tab changes storage */
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
        load();
    }
});

function load() {
    chrome.storage.local.get(STORAGE_KEYS, (result) => {
        data.workspaces = result.workspaces || {};
        data.active = result.active || null;
        data.macro = result.macro || {};
        data.aliases = result.aliases || {};
        data.config = result.config || {tabBehaviour: DEFAULT_TAB_BEHAVIOUR};
        if (data.config.tabBehaviour === undefined) {
            data.config.tabBehaviour = DEFAULT_TAB_BEHAVIOUR;
        }
        render();
    });
}

function persist(keys) {
    const payload = {};
    keys.forEach(key => {
        payload[key] = data[key];
    });
    chrome.storage.local.set(payload);
}

function render() {
    renderGeneral();
    renderAliases();
    renderMacros();
    renderWorkspaces();
}

/* ----- Static controls ----- */
function wireStaticControls() {
    document.querySelectorAll('input[name="tab-behaviour"]').forEach(radio => {
        radio.addEventListener('change', (event) => {
            data.config.tabBehaviour = event.target.value;
            persist(['config']);
        });
    });

    document.getElementById('active-workspace').addEventListener('change', (event) => {
        data.active = event.target.value || null;
        persist(['active']);
    });

    document.getElementById('export-btn').addEventListener('click', exportBackup);

    const importInput = document.getElementById('import-input');
    document.getElementById('import-btn').addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', importBackup);

    document.getElementById('alias-form').addEventListener('submit', (event) => {
        event.preventDefault();
        addAlias();
    });
}

/* ----- General ----- */
function renderGeneral() {
    const behaviour = data.config.tabBehaviour || DEFAULT_TAB_BEHAVIOUR;
    document.querySelectorAll('input[name="tab-behaviour"]').forEach(radio => {
        radio.checked = radio.value === behaviour;
    });

    const select = document.getElementById('active-workspace');
    select.textContent = '';
    const workspaceNames = Object.keys(data.workspaces).sort();
    if (workspaceNames.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No workspaces cached';
        select.appendChild(option);
        select.disabled = true;
        return;
    }
    select.disabled = false;
    workspaceNames.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        option.selected = name === data.active;
        select.appendChild(option);
    });
}

/* ----- Backup & restore ----- */
function exportBackup() {
    chrome.storage.local.get(null, (allData) => {
        const blob = new Blob([JSON.stringify(allData, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'bql-backup.json';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    });
}

function importBackup(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) {
        return;
    }
    const reader = new FileReader();
    reader.onload = () => {
        let parsed;
        try {
            parsed = JSON.parse(reader.result);
        } catch (error) {
            alert('Import failed: the selected file is not valid JSON.');
            return;
        }
        if (typeof parsed !== 'object' || parsed === null) {
            alert('Import failed: unexpected file contents.');
            return;
        }
        if (!confirm('Importing will replace your current BQL data. Continue?')) {
            return;
        }
        chrome.storage.local.clear(() => {
            chrome.storage.local.set(parsed, () => {
                load();
                alert('Backup imported successfully.');
            });
        });
    };
    reader.readAsText(file);
}

/* ----- Aliases ----- */
function renderAliases() {
    const tbody = document.querySelector('#aliases-table tbody');
    const table = document.getElementById('aliases-table');
    const empty = document.getElementById('aliases-empty');
    tbody.textContent = '';
    const aliasNames = Object.keys(data.aliases).sort();
    if (aliasNames.length === 0) {
        table.style.display = 'none';
        empty.style.display = '';
        return;
    }
    table.style.display = '';
    empty.style.display = 'none';
    aliasNames.forEach(alias => {
        const row = document.createElement('tr');
        const aliasCell = document.createElement('td');
        aliasCell.textContent = alias;
        const repoCell = document.createElement('td');
        repoCell.textContent = data.aliases[alias];
        const actionCell = document.createElement('td');
        actionCell.appendChild(makeButton('Remove', 'danger', () => removeAlias(alias)));
        row.append(aliasCell, repoCell, actionCell);
        tbody.appendChild(row);
    });
}

function addAlias() {
    const aliasInput = document.getElementById('alias-name');
    const repoInput = document.getElementById('alias-repo');
    const alias = aliasInput.value.trim().toLowerCase();
    const repo = repoInput.value.trim().toLowerCase();
    if (alias === '' || repo === '') {
        alert('Please provide both an alias and a repository name.');
        return;
    }
    if (!/^[a-z0-9-]+$/.test(alias)) {
        alert('Alias may only contain letters (a-z), numbers (0-9) and hyphens (-).');
        return;
    }
    data.aliases[alias] = repo;
    persist(['aliases']);
    aliasInput.value = '';
    repoInput.value = '';
    renderAliases();
}

function removeAlias(alias) {
    delete data.aliases[alias];
    persist(['aliases']);
    renderAliases();
}

/* ----- Macros ----- */
function renderMacros() {
    const container = document.getElementById('macros-container');
    const empty = document.getElementById('macros-empty');
    container.textContent = '';
    const macroNames = Object.keys(data.macro).sort();
    if (macroNames.length === 0) {
        empty.style.display = '';
        return;
    }
    empty.style.display = 'none';
    macroNames.forEach(macroName => {
        const block = document.createElement('div');
        block.className = 'macro-block';

        const header = document.createElement('div');
        header.className = 'block-header';
        const title = document.createElement('span');
        title.className = 'block-title';
        title.textContent = macroName;
        const badge = document.createElement('span');
        badge.className = 'badge';
        const repos = data.macro[macroName] || [];
        badge.textContent = `${repos.length} repo${repos.length === 1 ? '' : 's'}`;
        title.appendChild(badge);
        header.appendChild(title);
        header.appendChild(makeButton('Remove macro', 'danger', () => removeMacro(macroName)));
        block.appendChild(header);

        if (repos.length > 0) {
            const list = document.createElement('ul');
            list.className = 'item-list';
            repos.forEach(repo => {
                const item = document.createElement('li');
                const label = document.createElement('span');
                label.textContent = repo;
                item.appendChild(label);
                item.appendChild(makeButton('Remove', 'secondary', () => removeMacroRepo(macroName, repo)));
                list.appendChild(item);
            });
            block.appendChild(list);
        }
        container.appendChild(block);
    });
}

function removeMacro(macroName) {
    if (!confirm(`Remove the macro "${macroName}"?`)) {
        return;
    }
    delete data.macro[macroName];
    persist(['macro']);
    renderMacros();
}

function removeMacroRepo(macroName, repo) {
    const repos = data.macro[macroName] || [];
    const index = repos.indexOf(repo);
    if (index !== -1) {
        repos.splice(index, 1);
        persist(['macro']);
        renderMacros();
    }
}

/* ----- Workspaces & repositories ----- */
function renderWorkspaces() {
    const container = document.getElementById('workspaces-container');
    const empty = document.getElementById('workspaces-empty');
    container.textContent = '';
    const workspaceNames = Object.keys(data.workspaces).sort();
    if (workspaceNames.length === 0) {
        empty.style.display = '';
        return;
    }
    empty.style.display = 'none';
    workspaceNames.forEach(workspaceName => {
        const block = document.createElement('div');
        block.className = 'workspace-block';

        const header = document.createElement('div');
        header.className = 'block-header';
        const title = document.createElement('span');
        title.className = 'block-title';
        title.textContent = workspaceName;
        if (workspaceName === data.active) {
            const badge = document.createElement('span');
            badge.className = 'badge';
            badge.textContent = 'active';
            title.appendChild(badge);
        }
        header.appendChild(title);

        const headerActions = document.createElement('div');
        headerActions.className = 'header-actions';
        if (workspaceName !== data.active) {
            headerActions.appendChild(makeButton('Set active', 'secondary', () => setActiveWorkspace(workspaceName)));
        }
        headerActions.appendChild(makeButton('Remove workspace', 'danger', () => removeWorkspace(workspaceName)));
        header.appendChild(headerActions);
        block.appendChild(header);

        const repositories = data.workspaces[workspaceName].repositories || {};
        const repoNames = Object.keys(repositories).sort();
        if (repoNames.length === 0) {
            const none = document.createElement('p');
            none.className = 'empty';
            none.textContent = 'No repositories cached.';
            block.appendChild(none);
        } else {
            const list = document.createElement('ul');
            list.className = 'item-list';
            repoNames.forEach(repoName => {
                const item = document.createElement('li');
                const label = document.createElement('span');
                label.textContent = repoName;
                item.appendChild(label);
                item.appendChild(makeButton('Remove', 'secondary', () => removeRepository(workspaceName, repoName)));
                list.appendChild(item);
            });
            block.appendChild(list);
        }
        container.appendChild(block);
    });
}

function setActiveWorkspace(workspaceName) {
    data.active = workspaceName;
    persist(['active']);
    render();
}

function removeWorkspace(workspaceName) {
    if (!confirm(`Remove the workspace "${workspaceName}" and all its cached data?`)) {
        return;
    }
    delete data.workspaces[workspaceName];
    if (data.active === workspaceName) {
        const remaining = Object.keys(data.workspaces);
        data.active = remaining.length > 0 ? remaining[0] : null;
        persist(['workspaces', 'active']);
    } else {
        persist(['workspaces']);
    }
    render();
}

function removeRepository(workspaceName, repoName) {
    const workspace = data.workspaces[workspaceName];
    if (workspace && workspace.repositories && workspace.repositories[repoName] !== undefined) {
        delete workspace.repositories[repoName];
        persist(['workspaces']);
        renderWorkspaces();
    }
}

/* ----- Helpers ----- */
function makeButton(label, className, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
}
