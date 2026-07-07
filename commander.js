console.log("I am the BQL Commander in charge of the BQL extension");

chrome.runtime.onInstalled.addListener(() => {
    chrome.tabs.create({url: 'help.html'});
});

var bitbucketQueryData = {
    active: null,
    workspaces: {},
    macro: {},
    alias: {},
    config: {
        tabBehaviour: "new"
    },
    isLoaded: false
}

loadFromLocalStorage();

function loadFromLocalStorage() {
    chrome.storage.local.get(["workspaces", "active", "macro", "alias", "config"], (result) => {
        if (result.workspaces === undefined) {
            saveToLocalStorage();
            console.log("No data found in local storage, so created a new one");
        } else {
            bitbucketQueryData = result;
            if (bitbucketQueryData.macro === undefined) {
                bitbucketQueryData.macro = {};
            }
            if (bitbucketQueryData.alias === undefined) {
                bitbucketQueryData.alias = {};
            }
            if (bitbucketQueryData.config === undefined) {
                bitbucketQueryData.config = {tabBehaviour: "new"};
            }
            console.log("Data found & it is set to", bitbucketQueryData);
        }
        bitbucketQueryData.isLoaded = true;
    });
    refreshContextMenu();
}

/* Context Menu Setup */
function refreshContextMenu() {
    chrome.contextMenus.removeAll();
    var parent1 = chrome.contextMenus.create({
        id: "macroParent",
        "title": "Add this repo to macro",
        "contexts": ["all"]
    });
    Object.keys(bitbucketQueryData.macro).map(macro => {
        chrome.contextMenus.create({id: "macro" + macro, "title": macro, "parentId": parent1, "contexts": ["all"]});
    });
}

function contextClick(info, tab) {
    const {linkUrl, pageUrl, menuItemId} = info;
    if (menuItemId.includes("macro")) {
        const menu = menuItemId.split("macro")[1];
        const fragments = (linkUrl || pageUrl).split("bitbucket.org/")[1].split("/");
        const workspaceName = fragments[0];
        const repositoryName = fragments[1];
        if (bitbucketQueryData.macro[menu] === undefined) {
            bitbucketQueryData.macro[menu] = [];
        }
        const key = `${workspaceName}/${repositoryName}`;
        if (!bitbucketQueryData.macro[menu].includes(key)) {
            bitbucketQueryData.macro[menu].push(key);
            notifyUser("Added to macro", `Added ${repositoryName} of ${workspaceName} to ${menu}`);
        } else {
            notifyUser("Already in macro", `${repositoryName} of ${workspaceName} is already in ${menu}`);
        }
    }
}

chrome.contextMenus.onClicked.addListener(contextClick);

chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {
        console.log('req', request.message);
        if (!bitbucketQueryData.isLoaded) {
            console.log('Data not loaded yet');
            sendResponse({roger: false});
            return;
        }
        switch (request.message) {
            case 'found_this_commander':
                console.log(request, 'found_this_commander');
                processScrapedData(request);
                sendResponse({roger: true});
                break;
            case 'import_data':
                processImportData(request.data);
                sendResponse({roger: true});
                break;
            default:
                console.log('default', request);
                sendResponse({roger: false});
        }
    }
);

function processImportData(data) {
    if (!data || typeof data !== 'object') {
        notifyUser('Import failed', 'Invalid backup file');
        return;
    }
    if (data.workspaces) bitbucketQueryData.workspaces = data.workspaces;
    if (data.active) bitbucketQueryData.active = data.active;
    if (data.macro) bitbucketQueryData.macro = data.macro;
    if (data.alias) bitbucketQueryData.alias = data.alias;
    if (data.config) bitbucketQueryData.config = {...bitbucketQueryData.config, ...data.config};
    saveToLocalStorage();
    notifyUser('Import complete', 'Your BQL data has been restored');
}

function processScrapedData(data) {
    const type = data.type;
    let workspaceName = data.workspaceName?.toLowerCase().trim() || '';
    if (workspaceName === '' || workspaceName === undefined) {
        console.log("No workspace name found");
        return;
    }
    if (type === 'workspace') {
        processWorkspaceData(workspaceName);
    } else if (type === 'repositories') {
        let repositories = data.repositories.map(repo => repo?.toLowerCase().trim()).filter(repo => repo.length > 0);
        processRepositoriesData(workspaceName, repositories);
    } else {
        let repositoryName = data.repositoryName?.toLowerCase().trim() || '';
        if (repositoryName === '' || repositoryName === undefined) {
            console.log("No repository name found");
            return;
        }
        switch (type) {
            case 'branches':
                const branches = data.branches || [];
                const mappedBranches = branches.map(branch => branch.trim()).filter(branch => branch.length > 0);
                processBranchesData(workspaceName, repositoryName, mappedBranches);
                break;
            case 'tags':
                const tags = data.tags || [];
                const mappedTags = tags.map(tag => tag.trim()).filter(tag => tag.length > 0);
                processTagsData(workspaceName, repositoryName, mappedTags);
                break;
            case 'commits':
                const commitData = data.commits.map(commit => {
                    const {commitId, message} = commit;
                    const commitIdShort = commitId.trim().slice(0, 7);
                    return {commitId: commitIdShort, message: message}
                }).filter(commit => commit.commitId.length > 0);
                const commitsBranches = data.branches || [];
                const mappedCommitsBranches = commitsBranches.map(branch => branch.trim()).filter(branch => branch.length > 0);
                const commitsTags = data.tags || [];
                const mappedCommitsTags = commitsTags.map(tag => tag.trim()).filter(tag => tag.length > 0);
                processCommitsData(workspaceName, repositoryName, mappedCommitsBranches, mappedCommitsTags, commitData);
                break;
            case 'pull-requests':
                const pullRequests = data.pullRequests.filter(pullRequest => pullRequest.pullNo.length > 0);
                processPullRequestsData(workspaceName, repositoryName, pullRequests);
                break;
            case 'pipelines':
                const pipelines = data.pipelines.filter(pipeline => pipeline.pipelineNo.length > 0);
                processPipelineData(workspaceName, repositoryName, pipelines);
                break;
            case 'environments':
                const environments = data.environments.map(environment => {
                    const {environmentId, environmentName} = environment;
                    return {
                        environmentId: environmentId?.trim(),
                        environmentName: environmentName?.toLowerCase().trim()
                    }
                }).filter(environment => environment.environmentName.length > 0);
                processEnvironmentsData(workspaceName, repositoryName, environments);
                break;
            default:
                console.log("Unknown data type", type);
        }
    }
    saveToLocalStorage();
}

function setAsActiveWorkspace(workspaceName) {
    workspaceName = workspaceName?.toLowerCase();
    bitbucketQueryData.active = workspaceName;
}

function processWorkspaceData(workspaceName) {
    if (bitbucketQueryData.workspaces[workspaceName] === undefined) {
        bitbucketQueryData.workspaces[workspaceName] = {
            lastUsed: new Date().getTime(),
            repositories: {}
        }
        if (bitbucketQueryData.active === null)
            bitbucketQueryData.active = workspaceName;
        accessedWorkspace(workspaceName);
    }
}

function processRepositoriesData(workspaceName, repositories) {
    if (bitbucketQueryData.workspaces[workspaceName] === undefined) {
        processWorkspaceData(workspaceName);
    }
    for (const repositoryName of repositories) {
        if (bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName] !== undefined)
            continue;
        bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName] = {
            branches: {},
            commits: {},
            tags: {},
            pipelines: {},
            pullRequests: {},
            environments: {},
            lastUsed: null
        }
    }
    accessedWorkspace(workspaceName);
    if (repositories.length === 1) {
        for (const repositoryName of repositories) {
            accessedRepository(workspaceName, repositoryName);
        }
    }
}

function processBranchesData(workspaceName, repositoryName, branches) {
    if (bitbucketQueryData.workspaces[workspaceName] === undefined) {
        processWorkspaceData(workspaceName);
    }
    if (bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName] === undefined) {
        processRepositoriesData(workspaceName, [repositoryName]);
    }
    for (const branch of branches) {
        if (bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName].branches[branch] !== undefined)
            continue;
        bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName].branches[branch] = {lastUsed: null}
    }
    if (branches.length === 1) {
        for (const branch of branches) {
            accessedBranch(workspaceName, repositoryName, branch);
        }
    }
    accessedWorkspace(workspaceName);
    accessedRepository(workspaceName, repositoryName);
}

function processTagsData(workspaceName, repositoryName, tags) {
    if (bitbucketQueryData.workspaces[workspaceName] === undefined) {
        processWorkspaceData(workspaceName);
    }
    if (bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName] === undefined) {
        processRepositoriesData(workspaceName, [repositoryName]);
    }
    for (const tag of tags) {
        if (bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName].tags[tag] !== undefined)
            continue;
        bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName].tags[tag] = {lastUsed: null}
    }
    if (tags.length === 1) {
        for (const tag of tags) {
            accessedTag(workspaceName, repositoryName, tag);
        }
    }
    accessedWorkspace(workspaceName);
    accessedRepository(workspaceName, repositoryName);
}

function processCommitsData(workspaceName, repositoryName, branches, tags, commits) {
    if (bitbucketQueryData.workspaces[workspaceName] === undefined) {
        processWorkspaceData(workspaceName);
    }
    if (bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName] === undefined) {
        processRepositoriesData(workspaceName, [repositoryName]);
    }
    if (branches === undefined || branches === null) branches = [];
    if (tags === undefined || tags === null) tags = [];
    for (const branch of branches) {
        if (bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName].branches[branch] === undefined) {
            processBranchesData(workspaceName, repositoryName, [branch]);
        }
        accessedBranch(workspaceName, repositoryName, branch);
    }
    for (const tag of tags) {
        if (bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName].tags[tag] === undefined) {
            processTagsData(workspaceName, repositoryName, [tag]);
        }
        accessedTag(workspaceName, repositoryName, tag);
    }
    for (const commit of commits) {
        const {commitId, message} = commit;
        if (bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName].commits[commitId] !== undefined) {
            for (const branch of branches) {
                if (bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName].commits[commitId].branches.indexOf(branch) === -1) {
                    bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName].commits[commitId].branches.push(branch);
                }
            }
            for (const tag of tags) {
                if (bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName].commits[commitId].tags.indexOf(tag) === -1) {
                    bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName].commits[commitId].tags.push(tag);
                }
            }
            bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName].commits[commitId].message = message;
            continue;
        }
        bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName].commits[commitId] = {
            branches: branches,
            tags: tags,
            message: message,
            lastUsed: null
        }
    }
    accessedWorkspace(workspaceName);
    accessedRepository(workspaceName, repositoryName);
    if (commits.length === 1) {
        accessedCommit(workspaceName, repositoryName, commits[0].commitId);
    }
}

function processPullRequestsData(workspaceName, repositoryName, pullRequests) {
    if (bitbucketQueryData.workspaces[workspaceName] === undefined) {
        processWorkspaceData(workspaceName);
    }
    if (bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName] === undefined) {
        processRepositoriesData(workspaceName, [repositoryName]);
    }
    for (const pullRequest of pullRequests) {
        const {pullNo, pullName} = pullRequest;
        if (bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName].pullRequests[pullNo] !== undefined) {
            bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName].pullRequests[pullNo].pullName = pullName;
            continue;
        }
        bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName].pullRequests[pullNo] = {
            pullName: pullName,
            lastUsed: null
        }
    }
    if (pullRequests.length === 1) {
        for (const pullRequest of pullRequests) {
            accessedPullRequest(workspaceName, repositoryName, pullRequest.pullNo);
        }
    }
    accessedWorkspace(workspaceName);
    accessedRepository(workspaceName, repositoryName);
}

function processPipelineData(workspaceName, repositoryName, pipelines) {
    if (bitbucketQueryData.workspaces[workspaceName] === undefined) {
        processWorkspaceData(workspaceName);
    }
    if (bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName] === undefined) {
        processRepositoriesData(workspaceName, [repositoryName]);
    }
    for (const pipeline of pipelines) {
        const {pipelineNo, pipelineName} = pipeline;
        if (bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName].pipelines[pipelineNo] !== undefined) {
            bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName].pipelines[pipelineNo].pipelineName = pipelineName;
            continue;
        }
        bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName].pipelines[pipelineNo] = {
            pipelineName: pipelineName,
            lastUsed: null
        }
    }
    if (pipelines.length === 1) {
        for (const pipeline of pipelines) {
            accessedPipeline(workspaceName, repositoryName, pipeline.pipelineNo);
        }
    }
    accessedWorkspace(workspaceName);
    accessedRepository(workspaceName, repositoryName);
}

function processEnvironmentsData(workspaceName, repositoryName, environments) {
    if (bitbucketQueryData.workspaces[workspaceName] === undefined) {
        processWorkspaceData(workspaceName);
    }
    if (bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName] === undefined) {
        processRepositoriesData(workspaceName, [repositoryName]);
    }
    for (const environment of environments) {
        const {environmentId, environmentName} = environment;
        if (bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName].environments[environmentName] !== undefined) {
            if (environmentId !== undefined && environmentId !== null && environmentId?.trim() !== '') {
                bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName].environments[environmentName].environmentId = environmentId;
            }
            continue;
        }
        bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName].environments[environmentName] = {
            environmentId: environmentId,
            lastUsed: null
        }
    }
    if (environments.length === 1) {
        for (const environment of environments) {
            accessedEnvironment(workspaceName, repositoryName, environment.environmentName);
        }
    }
    accessedWorkspace(workspaceName);
    accessedRepository(workspaceName, repositoryName);
}

/* General analytics utility */
function accessedWorkspace(workspaceName) {
    bitbucketQueryData.workspaces[workspaceName].lastUsed = new Date().getTime();
}

function accessedRepository(workspaceName, repositoryName) {
    bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName].lastUsed = new Date().getTime();
}

function accessedBranch(workspaceName, repositoryName, branch) {
    bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName].branches[branch].lastUsed = new Date().getTime();
}

function accessedTag(workspaceName, repositoryName, tag) {
    bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName].tags[tag].lastUsed = new Date().getTime();
}

function accessedCommit(workspaceName, repositoryName, commitId) {
    bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName].commits[commitId].lastUsed = new Date().getTime();
}

function accessedPullRequest(workspaceName, repositoryName, pullNo) {
    bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName].pullRequests[pullNo].lastUsed = new Date().getTime();
}

function accessedPipeline(workspaceName, repositoryName, pipelineNo) {
    bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName].pipelines[pipelineNo].lastUsed = new Date().getTime();
}

function accessedEnvironment(workspaceName, repositoryName, environmentName) {
    bitbucketQueryData.workspaces[workspaceName].repositories[repositoryName].environments[environmentName].lastUsed = new Date().getTime();
}

/* Tab override utility — strips trailing NEW or SAME from fragments */
function extractTabOverride(fragments) {
    // CONFIG TAB NEW/SAME — NEW and SAME are values, not tab overrides
    if (fragments[0]?.toUpperCase() === 'CONFIG') {
        return {fragments, tabOverride: null};
    }
    const last = fragments[fragments.length - 1]?.toUpperCase();
    if (last === 'NEW' || last === 'SAME') {
        return {fragments: fragments.slice(0, -1), tabOverride: last};
    }
    return {fragments, tabOverride: null};
}

/* Alias utility — resolves a typed name to its real repo name */
function resolveAlias(name) {
    return bitbucketQueryData.alias?.[name?.toLowerCase()] || name;
}

/* Omnibox: Search processing */
chrome.omnibox.onInputChanged.addListener(function (text, suggest) {
    console.log('✏️ onInputChanged: ' + text);
    const rawFragments = text.trim().split(' ').map(f => f.trim()).filter(f => f.length > 0);
    const {fragments, tabOverride} = extractTabOverride(rawFragments);

    // Confirmed tab override — suffix all suggestion contents with NEW/SAME
    if (tabOverride) {
        const collected = [];
        suggestionEngine(fragments, (s) => collected.push(...s));
        suggest(collected.map(s => createSuggestion(
            s.content + ' ' + tabOverride,
            tabOverride === 'NEW' ? 'Open in a new tab' : 'Open in the same tab'
        )));
        return;
    }

    // Partial tab override hint (e.g. N, NE, S, SA, SAM) — only when normal flow returns nothing
    const last = fragments[fragments.length - 1]?.toUpperCase();
    if (fragments.length >= 2 && last && last.length <= 4
            && ('NEW'.startsWith(last) || 'SAME'.startsWith(last))) {
        const normalSuggestions = [];
        suggestionEngine(fragments, (s) => normalSuggestions.push(...s));
        if (normalSuggestions.length === 0) {
            const baseFragments = fragments.slice(0, -1);
            const baseSuggestions = [];
            suggestionEngine(baseFragments, (s) => baseSuggestions.push(...s));
            if (baseSuggestions.length > 0) {
                const tabSuggestions = [];
                if ('NEW'.startsWith(last))
                    tabSuggestions.push(...baseSuggestions.map(s => createSuggestion(s.content + ' NEW', 'Open in a new tab')));
                if ('SAME'.startsWith(last))
                    tabSuggestions.push(...baseSuggestions.map(s => createSuggestion(s.content + ' SAME', 'Open in the same tab')));
                suggest(tabSuggestions);
                return;
            }
        }
    }

    console.log('fragments', fragments);
    suggestionEngine(fragments, suggest);
});

function defaultSuggest() {
    return [
        {content: 'SET', description: 'SET "workspace-name" : Set the active workspace'},
        {content: 'LIST', description: 'LIST "workspace-name" : Open the list of repositories in the workspace'},
        {content: 'HELP', description: 'HELP : Open the commands reference page'},
        {content: 'MACRO', description: 'MACRO : Run commands over multiple repositories'},
        {content: 'ALIAS', description: 'ALIAS : Create short aliases for repository names'},
        {content: 'CONFIG', description: 'CONFIG : Configure extension settings (e.g. tab behaviour)'},
        {content: 'EXPORT', description: 'EXPORT : Download a backup of all BQL data'},
        {content: 'IMPORT', description: 'IMPORT : Open import page to restore from a backup'},
        {content: ' ', description: '"repo-name" : Open the repository'}
    ];
}

function suggestionEngine(fragments, suggest) {
    const command = fragments[0]?.toUpperCase() || '';
    let suggestions = [];
    switch (command) {
        case 'SET':
            suggest(suggestSet(fragments));
            break;
        case 'LIST':
            suggest(suggestList(fragments));
            break;
        case 'HELP':
            suggest([createSuggestion('HELP', 'Open the commands reference page')]);
            break;
        case 'MACRO':
            suggest(suggestMacro(fragments));
            break;
        case 'ALIAS':
            suggest(suggestAlias(fragments));
            break;
        case 'CONFIG':
            suggest(suggestConfig(fragments));
            break;
        case 'EXPORT':
            suggest([createSuggestion('EXPORT', 'Download a backup of all BQL data as bql-backup.json')]);
            break;
        case 'IMPORT':
            suggest([createSuggestion('IMPORT', 'Open import page to restore BQL data from a backup file')]);
            break;
        case '':
            suggest(defaultSuggest().concat(suggestOpen([])));
            break;
        default:
            suggestions = defaultSuggest()
                .filter(s => s.content.includes(command))
                .filter(s => s.content.trim() !== command);
            suggest(suggestions.concat(suggestOpen(fragments)));
    }
}

function suggestSet(fragments) {
    const workspaceName = fragments[1] || '';
    return Object.keys(bitbucketQueryData.workspaces)
        .filter(ws => ws.includes(workspaceName))
        .filter(ws => ws !== bitbucketQueryData.active)
        .sort((a, b) => sortOnLastUsed(bitbucketQueryData.workspaces, a, b))
        .map(ws => createSuggestion(`SET ${ws}`, "Set as the active workspace"));
}

function suggestList(fragments) {
    const workspaceName = fragments[1] || '';
    const suggestions = [];
    if (workspaceName === '') {
        suggestions.push(createSuggestion("LIST", `List the repos in the ${bitbucketQueryData.active} workspace`));
    }
    Object.keys(bitbucketQueryData.workspaces)
        .filter(ws => ws.includes(workspaceName))
        .filter(ws => ws !== bitbucketQueryData.active || workspaceName !== '')
        .sort((a, b) => sortOnLastUsed(bitbucketQueryData.workspaces, a, b))
        .map(ws => suggestions.push(createSuggestion(`LIST ${ws}`, "List the repositories in the workspace")));
    return suggestions;
}

function suggestConfig(fragments) {
    const subCommand = fragments[1]?.toUpperCase() || '';
    const current = bitbucketQueryData.config.tabBehaviour;
    const suggestions = [];
    if (subCommand === '' || 'TAB'.startsWith(subCommand)) {
        suggestions.push(createSuggestion('CONFIG TAB NEW', `Open links in a new tab by default (current: ${current})`));
        suggestions.push(createSuggestion('CONFIG TAB SAME', `Open links in the same tab by default (current: ${current})`));
    }
    return suggestions;
}

function suggestAlias(fragments) {
    const subCommand = fragments[1]?.toUpperCase() || '';
    const suggestions = [];
    if (subCommand === '' || 'SET'.startsWith(subCommand)) {
        suggestions.push(createSuggestion('ALIAS SET', '{alias} {repo-name} : Create an alias for a repository'));
    }
    if (subCommand === '' || 'LIST'.startsWith(subCommand)) {
        suggestions.push(createSuggestion('ALIAS LIST', 'List all configured aliases'));
    }
    if (subCommand === '' || 'REMOVE'.startsWith(subCommand)) {
        if (subCommand === 'REMOVE') {
            const aliasFilter = fragments[2]?.toLowerCase() || '';
            Object.keys(bitbucketQueryData.alias)
                .filter(a => a.includes(aliasFilter))
                .map(a => suggestions.push(createSuggestion(`ALIAS REMOVE ${a}`, `Remove alias for "${bitbucketQueryData.alias[a]}"`)));
        } else {
            suggestions.push(createSuggestion('ALIAS REMOVE', '{alias} : Remove an alias'));
        }
    }
    return suggestions;
}

function suggestMacro(fragments) {
    const commandName = fragments[1]?.toLowerCase() || '';
    const subCommandName = fragments[2]?.toUpperCase() || '';
    const suggestions = [];
    const macroKeys = Object.keys(bitbucketQueryData.macro).filter(macro => macro.includes(commandName));
    if (macroKeys.length === 1) {
        const macro = macroKeys[0];
        const tempSuggestions = [
            createSuggestion(`MACRO ${macro}`, `Open the source of all the repos in the macro`),
            createSuggestion(`MACRO ${macro} BRANCH`, `Open the branches of all the repos in the macro`),
            createSuggestion(`MACRO ${macro} TAG`, `<tag-name> Open the tag in all the repos in the macro`),
            createSuggestion(`MACRO ${macro} PR`, `Open the pull requests in all the repos in the macro`),
            createSuggestion(`MACRO ${macro} PIPELINE`, `Open the pipelines in all the repos in the macro`),
            createSuggestion(`MACRO ${macro} DEPLOY`, `Open the deployments in all the repos in the macro`),
            createSuggestion(`MACRO ${macro} COMPARE`, `<from> TO <to> Compare branches or tags in all repos`),
            createSuggestion(`MACRO ${macro} DIFF`, `<from> TO <to> Diff branches or tags in all repos`)
        ];
        tempSuggestions
            .filter(s => (s.content.split(' ')[2] || '').includes(subCommandName))
            .map(s => suggestions.push(s));
    } else {
        macroKeys.map(macro => suggestions.push(createSuggestion(`MACRO ${macro}`, "Run commands over multiple repositories")));
    }
    if ('list'.includes(commandName) || commandName === '') {
        if (commandName === 'list') {
            Object.keys(bitbucketQueryData.macro)
                .filter(macro => macro.includes(subCommandName))
                .map(macro => suggestions.push(createSuggestion(`MACRO LIST ${macro}`, "List all the repositories in the macro")));
        } else {
            suggestions.push(createSuggestion(`MACRO LIST`, "{name} List all the macros"));
        }
    }
    if ('new'.includes(commandName) || commandName === '') {
        suggestions.push(createSuggestion(`MACRO NEW`, "{name} Add a new macro"));
    }
    if ('remove'.includes(commandName) || commandName === '') {
        if (commandName === 'remove') {
            Object.keys(bitbucketQueryData.macro)
                .filter(macro => macro.includes(subCommandName))
                .map(macro => suggestions.push(createSuggestion(`MACRO REMOVE ${macro}`, "Remove the macro")));
        } else {
            suggestions.push(createSuggestion(`MACRO REMOVE`, "{name} Remove a macro"));
        }
    }
    if ('edit'.includes(commandName) || commandName === '') {
        if (commandName === 'edit') {
            const editMacroKeys = Object.keys(bitbucketQueryData.macro).filter(macro => macro.includes(subCommandName));
            if (editMacroKeys.length > 1) {
                editMacroKeys.map(macro => suggestions.push(createSuggestion(`MACRO EDIT ${macro}`, "Edit the macro")));
            } else if (editMacroKeys.length === 1) {
                const macro = editMacroKeys[0];
                const repoCommand = fragments[4] || '';
                bitbucketQueryData.macro[macro]
                    .filter(repo => repo.includes(repoCommand))
                    .map(repo => suggestions.push(createSuggestion(`MACRO EDIT ${macro} REMOVE ${repo}`, "Remove the repo from the macro")));
            }
        } else {
            suggestions.push(createSuggestion(`MACRO EDIT`, "{name} Edit a macro"));
        }
    }
    return suggestions;
}

function suggestOpen(fragments) {
    const repositoryInput = fragments[0] || '';
    const workspaceName = bitbucketQueryData.active;
    const suggestions = [];
    if (bitbucketQueryData.workspaces[workspaceName] === undefined) {
        return [];
    }
    const repositories = bitbucketQueryData.workspaces[workspaceName].repositories;

    // Resolve alias for data lookup; preserve typed text for suggestion content
    const resolvedRepoName = resolveAlias(repositoryInput);
    const isAlias = resolvedRepoName !== repositoryInput && repositories[resolvedRepoName] !== undefined;
    const suggestionPrefix = repositoryInput;
    const dataRepoName = isAlias ? resolvedRepoName : repositoryInput;

    if (repositories[dataRepoName] === undefined) {
        // List repos matching the typed text
        Object.keys(repositories)
            .filter(repo => repo.includes(repositoryInput))
            .sort((a, b) => sortOnLastUsed(repositories, a, b))
            .map(repo => suggestions.push(createSuggestion(repo, "Open the repository")));
        // Also surface matching aliases
        Object.entries(bitbucketQueryData.alias || {})
            .filter(([alias]) => alias.includes(repositoryInput))
            .filter(([, repo]) => repositories[repo] !== undefined)
            .map(([alias, repo]) => suggestions.push(createSuggestion(alias, `Alias for "${repo}"`)));
        return suggestions;
    }

    const repositoryData = repositories[dataRepoName];
    const command = fragments[1]?.toUpperCase() || '';

    if (command === 'BRANCH') {
        const branch = fragments[2] || '';
        const subCommand = fragments[3]?.toUpperCase() || '';
        if (branch === '') suggestions.push(createSuggestion(`${suggestionPrefix} BRANCH`, `Open the branches of the repository`));
        Object.keys(repositoryData.branches)
            .filter(b => b.includes(branch))
            .sort((a, b) => sortOnLastUsed(repositoryData.branches, a, b))
            .filter(() => subCommand === '')
            .map(b => suggestions.push(createSuggestion(`${suggestionPrefix} BRANCH ${b}`, `Open the branch`)));
        if (branch !== '' && subCommand === '')
            suggestions.push(createSuggestion(`${suggestionPrefix} BRANCH ${branch} COMMIT`, `Open the commit history of the branch`));
        Object.keys(repositoryData.commits)
            .filter(c => repositoryData.commits[c].branches.includes(branch))
            .map(c => suggestions.push(createSuggestion(`${suggestionPrefix} BRANCH ${branch} COMMIT ${c}`, escapeHtml(repositoryData.commits[c].message))));
    } else if (command === 'TAG') {
        const tag = fragments[2] || '';
        const subCommand = fragments[3]?.toUpperCase() || '';
        Object.keys(repositoryData.tags)
            .filter(t => t.includes(tag))
            .sort((a, b) => sortOnLastUsed(repositoryData.tags, a, b))
            .filter(() => subCommand === '')
            .map(t => suggestions.push(createSuggestion(`${suggestionPrefix} TAG ${t}`, `Open the tag`)));
        if (tag !== '' && subCommand === '')
            suggestions.push(createSuggestion(`${suggestionPrefix} TAG ${tag} COMMIT`, `Open the commit history of the tag`));
        Object.keys(repositoryData.commits)
            .filter(c => repositoryData.commits[c].tags.includes(tag))
            .map(c => suggestions.push(createSuggestion(`${suggestionPrefix} TAG ${tag} COMMIT ${c}`, repositoryData.commits[c].message)));
    } else if (command === 'COMMIT') {
        const commit = fragments[2]?.toLowerCase() || '';
        if (commit === '') suggestions.push(createSuggestion(`${suggestionPrefix} COMMIT`, `Open the commit history of the repository`));
        Object.keys(repositoryData.commits)
            .filter(c => c.includes(commit))
            .sort((a, b) => sortOnLastUsed(repositoryData.commits, a, b))
            .map(c => suggestions.push(createSuggestion(`${suggestionPrefix} COMMIT ${c}`, repositoryData.commits[c].message)));
    } else if (command === 'PR') {
        const pr = fragments[2]?.toLowerCase() || '';
        if (pr === '') suggestions.push(createSuggestion(`${suggestionPrefix} PR`, `Open the pull requests of the repository`));
        Object.keys(repositoryData.pullRequests)
            .filter(p => p.includes(pr))
            .sort((a, b) => sortOnLastUsed(repositoryData.pullRequests, a, b))
            .map(p => suggestions.push(createSuggestion(`${suggestionPrefix} PR ${p}`, repositoryData.pullRequests[p].pullName)));
    } else if (command === 'PIPELINE') {
        const pipeline = fragments[2]?.toLowerCase() || '';
        if (pipeline === '') suggestions.push(createSuggestion(`${suggestionPrefix} PIPELINE`, `Open the pipelines of the repository`));
        Object.keys(repositoryData.pipelines)
            .filter(p => p.includes(pipeline))
            .sort((a, b) => sortOnLastUsed(repositoryData.pipelines, a, b))
            .map(p => suggestions.push(createSuggestion(`${suggestionPrefix} PIPELINE ${p}`, repositoryData.pipelines[p].pipelineName)));
    } else if (command === 'DEPLOY') {
        const deploy = fragments[2]?.toLowerCase() || '';
        if (deploy === '') suggestions.push(createSuggestion(`${suggestionPrefix} DEPLOY`, `Open the deployments of the repository`));
        Object.keys(repositoryData.environments)
            .filter(e => e.includes(deploy))
            .filter(e => repositoryData.environments[e].environmentId !== undefined)
            .sort((a, b) => sortOnLastUsed(repositoryData.environments, a, b))
            .map(e => suggestions.push(createSuggestion(`${suggestionPrefix} DEPLOY ${e}`, `Open the deployment environment`)));
    } else if (command === 'COMPARE') {
        const branchFrom = fragments[2] || '';
        const subCmd = fragments[3]?.toUpperCase() || '';
        const branchTo = fragments[4] || '';
        const combined = buildCombinedBranchTagMap(repositoryData);
        Object.keys(combined)
            .filter(b => b.includes(branchFrom) && b !== branchFrom && subCmd === '')
            .sort((a, b) => combined[b] - combined[a])
            .map(b => suggestions.push(createSuggestion(`${suggestionPrefix} COMPARE ${b}`, `Compare branches or tags`)));
        Object.keys(combined)
            .filter(b => b.includes(branchTo) && b !== branchFrom && branchFrom !== '')
            .sort((a, b) => combined[b] - combined[a])
            .map(b => suggestions.push(createSuggestion(`${suggestionPrefix} COMPARE ${branchFrom} TO ${b}`, `Compare branches or tags`)));
    } else if (command === 'DIFF') {
        const branchDiff = fragments[2] || '';
        const subCmd = fragments[3]?.toUpperCase() || '';
        const branchTo = fragments[4] || '';
        const combined = buildCombinedBranchTagMap(repositoryData);
        Object.keys(combined)
            .filter(b => b.includes(branchDiff) && subCmd === '')
            .sort((a, b) => combined[b] - combined[a])
            .map(b => suggestions.push(createSuggestion(`${suggestionPrefix} DIFF ${b}`, `Diff branch or tag`)));
        Object.keys(combined)
            .filter(b => b.includes(branchTo) && b !== branchDiff && branchDiff !== '')
            .sort((a, b) => combined[b] - combined[a])
            .map(b => suggestions.push(createSuggestion(`${suggestionPrefix} DIFF ${branchDiff} TO ${b}`, `Diff branches or tags`)));
    } else if (command === 'CLONE') {
        const type = fragments[2]?.toUpperCase() || '';
        if (type === '' || 'SSH'.startsWith(type))
            suggestions.push(createSuggestion(`${suggestionPrefix} CLONE SSH`, 'Show SSH clone URL in notification'));
        if (type === '' || 'HTTPS'.startsWith(type))
            suggestions.push(createSuggestion(`${suggestionPrefix} CLONE HTTPS`, 'Show HTTPS clone URL in notification'));
    } else {
        const subCommands = [
            createSuggestion(`${suggestionPrefix} BRANCH`, `Open the branches of the repository`),
            createSuggestion(`${suggestionPrefix} TAG`, `Open the tags of the repository`),
            createSuggestion(`${suggestionPrefix} COMMIT`, `Open the commit history of the repository`),
            createSuggestion(`${suggestionPrefix} PR`, `Open the pull requests of the repository`),
            createSuggestion(`${suggestionPrefix} PIPELINE`, `Open the pipelines of the repository`),
            createSuggestion(`${suggestionPrefix} DEPLOY`, `Open the deployments of the repository`),
            createSuggestion(`${suggestionPrefix} COMPARE`, `Compare branches or tags`),
            createSuggestion(`${suggestionPrefix} DIFF`, `Diff branches or tags`),
            createSuggestion(`${suggestionPrefix} CLONE`, `Show clone URL`)
        ];
        subCommands
            .filter(s => s.content.split(' ').pop().includes(command))
            .map(s => suggestions.push(s));
    }
    return suggestions;
}

function buildCombinedBranchTagMap(repositoryData) {
    const combined = {};
    Object.keys(repositoryData.branches).map(b => { combined[b] = repositoryData.branches[b].lastUsed; });
    Object.keys(repositoryData.tags).map(t => { combined[t] = repositoryData.tags[t].lastUsed; });
    return combined;
}

function createSuggestion(content, description) {
    return {content: content, description: escapeHtml(content + " : " + description)};
}

function sortOnLastUsed(data, a, b) {
    return data[b].lastUsed - data[a].lastUsed;
}

/* Omnibox: Input processing */
chrome.omnibox.onInputEntered.addListener(function (text, disposition) {
    console.log(`✔️ onInputEntered: text -> ${text} | disposition -> ${disposition}`);
    const rawFragments = text.trim().split(' ').map(f => f.trim()).filter(f => f.length > 0);
    const {fragments, tabOverride} = extractTabOverride(rawFragments);
    console.log('fragments', fragments, 'tabOverride', tabOverride);
    processInput(fragments, tabOverride);
});

function processInput(fragments, tabOverride) {
    if (fragments.length === 0) {
        notifyUser('No command', 'Please enter a command');
        return;
    }
    const command = fragments[0]?.toUpperCase();
    try {
        switch (command) {
            case 'SET':
                processSet(fragments);
                break;
            case 'LIST':
                processList(fragments, tabOverride);
                break;
            case 'HELP':
                chrome.tabs.create({url: 'help.html'});
                break;
            case 'MACRO':
                processMacro(fragments, tabOverride);
                break;
            case 'ALIAS':
                processAlias(fragments);
                break;
            case 'CONFIG':
                processConfig(fragments);
                break;
            case 'EXPORT':
                processExport();
                break;
            case 'IMPORT':
                chrome.tabs.create({url: 'settings.html'});
                break;
            default:
                processOpen(fragments, tabOverride);
        }
    } catch (e) {
        console.error('Error', e);
        notifyUser('Error', 'An error occurred while processing the command');
    }
}

function processSet(fragments) {
    const workspaceName = fragments[1]?.toLowerCase();
    if (workspaceName === undefined) {
        notifyUser('No workspace name', 'Please enter a workspace name');
        return;
    }
    if (bitbucketQueryData.workspaces[workspaceName] === undefined) {
        processWorkspaceData(workspaceName);
        setAsActiveWorkspace(workspaceName);
        saveToLocalStorage();
        notifyUser('Created a active workspace', `Created and set workspace "${workspaceName}" as active`);
        return;
    }
    setAsActiveWorkspace(workspaceName);
    saveToLocalStorage();
    notifyUser('Set active workspace', `Set workspace "${workspaceName}" as active`);
}

function processList(fragments, tabOverride) {
    const workspaceName = fragments[1]?.toLowerCase() || bitbucketQueryData.active;
    if (bitbucketQueryData.workspaces[workspaceName] === undefined) {
        notifyUser('No workspace found', `No workspace found with the name "${workspaceName}"`);
        return;
    }
    openTab(`https://bitbucket.org/${workspaceName}/workspace/repositories/`, tabOverride);
}

function processOpen(fragments, tabOverride) {
    const repositoryInput = fragments[0]?.toLowerCase() || '';
    if (!repositoryInput) {
        notifyUser('No repository name', 'Please enter a repository name');
        return;
    }
    const repositoryName = resolveAlias(repositoryInput);
    const workspaceName = bitbucketQueryData.active;

    // CLONE: show URL in a persistent notification rather than navigating
    if (fragments[1]?.toUpperCase() === 'CLONE') {
        const type = fragments[2]?.toUpperCase() || 'SSH';
        const cloneUrl = type === 'HTTPS'
            ? `https://${workspaceName}@bitbucket.org/${workspaceName}/${repositoryName}.git`
            : `git@bitbucket.org:${workspaceName}/${repositoryName}.git`;
        notifyUser(`Clone URL (${type})`, cloneUrl, true);
        return;
    }

    const urlSuffix = getSuffixPathForOpen(fragments);
    if (urlSuffix === null) return;
    openTab(`https://bitbucket.org/${workspaceName}/${repositoryName}/${urlSuffix}`, tabOverride);
}

function processMacro(fragments, tabOverride) {
    const macroName = fragments[1]?.toLowerCase() || '';
    if (macroName === '') {
        const macroKeys = Object.keys(bitbucketQueryData.macro);
        if (macroKeys.length === 0) {
            notifyUser('No macros found', 'No macros found');
            return;
        }
        notifyUser('Macros', macroKeys.join(', '));
        return;
    }
    const blockedMacros = ['LIST', 'NEW', 'REMOVE', 'EDIT'];
    if (bitbucketQueryData.macro[macroName] === undefined) {
        const command = fragments[1]?.toUpperCase() || '';
        const subCommand = fragments[2]?.toLowerCase() || '';
        switch (command) {
            case 'LIST':
                const macro = fragments[2]?.toLowerCase() || '';
                if (bitbucketQueryData.macro[macro] === undefined) {
                    notifyUser('No macro found', `No macro found with the name "${macro}"`);
                    return;
                }
                if (bitbucketQueryData.macro[macro].length === 0) {
                    notifyUser('No repos found', `No repos found in the macro "${macro}"`);
                    return;
                }
                notifyUser('Macros', bitbucketQueryData.macro[macro].join(', '));
                break;
            case 'NEW':
                if (subCommand === '') {
                    notifyUser('No macro name', 'Please enter a macro name');
                    return;
                }
                if (blockedMacros.includes(subCommand?.toUpperCase())) {
                    notifyUser('Macro name blocked', 'Please enter a name other than "LIST", "NEW", "REMOVE", "EDIT"');
                    return;
                }
                const regex = /^[a-z0-9-]+$/;
                if (!regex.test(subCommand)) {
                    notifyUser('Invalid macro name', 'Only letters (a-z), numbers (0-9), and hyphens (-) are allowed.');
                    return;
                }
                if (bitbucketQueryData.macro[subCommand] !== undefined) {
                    notifyUser('Macro already exists', `Macro "${subCommand}" already exists`);
                    return;
                }
                bitbucketQueryData.macro[subCommand] = [];
                saveToLocalStorage();
                notifyUser('New macro created', `New macro "${subCommand}" created`);
                break;
            case 'REMOVE':
                delete bitbucketQueryData.macro[subCommand];
                saveToLocalStorage();
                notifyUser('Macro removed', `Macro "${subCommand}" removed`);
                break;
            case 'EDIT':
                const removeCommand = fragments[3]?.toUpperCase() || '';
                const repoName = fragments[4]?.toLowerCase() || '';
                if (repoName !== '' && removeCommand === 'REMOVE') {
                    const repoIndex = bitbucketQueryData.macro[subCommand].indexOf(repoName);
                    if (repoIndex !== -1) {
                        bitbucketQueryData.macro[subCommand].splice(repoIndex, 1);
                        saveToLocalStorage();
                        notifyUser('Repo removed', `Repo "${repoName}" removed from the macro "${subCommand}"`);
                    } else {
                        notifyUser('No repo found', `No repo found with the name "${repoName}" in the macro "${subCommand}"`);
                    }
                    return;
                }
                notifyUser('invalid command', 'Please enter a valid command, "MACRO EDIT {macro-name} REMOVE {repo-name}"');
                break;
            default:
                notifyUser('No macro found', `No macro found with the name "${macroName}"`);
        }
        return;
    }
    const repositories = bitbucketQueryData.macro[macroName];
    const macroFragments = fragments.slice(1); // drop "MACRO", keep "macroName COMMAND ..."
    const urlSuffix = getSuffixPathForOpen(macroFragments);
    repositories.map(repository => openTab(`https://bitbucket.org/${repository}/${urlSuffix}`, tabOverride));
}

function processConfig(fragments) {
    const subCommand = fragments[1]?.toUpperCase() || '';
    if (subCommand === 'TAB') {
        const value = fragments[2]?.toUpperCase() || '';
        if (value === 'NEW' || value === 'SAME') {
            bitbucketQueryData.config.tabBehaviour = value.toLowerCase();
            saveToLocalStorage();
            notifyUser('Config updated', `Tab behaviour set to "${value.toLowerCase()}"`);
        } else {
            notifyUser('Invalid value', 'Use "CONFIG TAB NEW" or "CONFIG TAB SAME"');
        }
    } else {
        notifyUser('Current config', `tabBehaviour: ${bitbucketQueryData.config.tabBehaviour} | Use CONFIG TAB NEW or CONFIG TAB SAME`);
    }
}

function processAlias(fragments) {
    const subCommand = fragments[1]?.toUpperCase() || '';
    switch (subCommand) {
        case 'SET': {
            const aliasName = fragments[2]?.toLowerCase();
            const repoName = fragments[3]?.toLowerCase();
            if (!aliasName || !repoName) {
                notifyUser('Invalid command', 'Use "ALIAS SET {alias} {repo-name}"');
                return;
            }
            bitbucketQueryData.alias[aliasName] = repoName;
            saveToLocalStorage();
            notifyUser('Alias created', `"${aliasName}" → "${repoName}"`);
            break;
        }
        case 'REMOVE': {
            const aliasName = fragments[2]?.toLowerCase();
            if (!aliasName || bitbucketQueryData.alias[aliasName] === undefined) {
                notifyUser('Alias not found', `No alias "${aliasName}" found`);
                return;
            }
            delete bitbucketQueryData.alias[aliasName];
            saveToLocalStorage();
            notifyUser('Alias removed', `Alias "${aliasName}" removed`);
            break;
        }
        case 'LIST': {
            const entries = Object.entries(bitbucketQueryData.alias);
            if (entries.length === 0) {
                notifyUser('No aliases', 'No aliases configured');
                return;
            }
            notifyUser('Aliases', entries.map(([a, r]) => `${a} → ${r}`).join(', '));
            break;
        }
        default:
            notifyUser('Unknown command', 'Use ALIAS SET | ALIAS REMOVE | ALIAS LIST');
    }
}

function processExport() {
    const dataToExport = {
        active: bitbucketQueryData.active,
        workspaces: bitbucketQueryData.workspaces,
        macro: bitbucketQueryData.macro,
        alias: bitbucketQueryData.alias,
        config: bitbucketQueryData.config
    };
    const json = JSON.stringify(dataToExport, null, 2);
    const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
    chrome.downloads.download({url: dataUrl, filename: 'bql-backup.json'});
    notifyUser('Export complete', 'bql-backup.json has been downloaded');
}

function getSuffixPathForOpen(fragments) {
    switch (fragments[1]?.toUpperCase()) {
        case 'BRANCH':
            const branch = fragments[2] || '';
            if (branch === '') return 'branches';
            if (fragments[3]?.toUpperCase() === 'COMMIT') {
                const commit = fragments[4]?.toLowerCase() || '';
                return commit === '' ? `commits/branch/${branch}` : `commits/${commit}`;
            }
            return `src/${branch}`;
        case 'TAG':
            const tag = fragments[2] || '';
            if (tag === '') {
                notifyUser('No tag name', 'Please enter a tag name');
                return `src`;
            }
            if (fragments[3]?.toUpperCase() === 'COMMIT') {
                const commit = fragments[4]?.toLowerCase() || '';
                return commit === '' ? `commits/tag/${tag}` : `commits/${commit}`;
            }
            return `src/${tag}`;
        case 'COMMIT':
            const commit = fragments[2]?.toLowerCase() || '';
            return commit === '' ? `commits` : `commits/${commit}`;
        case 'PR':
            const pr = fragments[2]?.toLowerCase() || '';
            return pr === '' ? `pull-requests` : `pull-requests/${pr}`;
        case 'PIPELINE':
            const pipeline = fragments[2]?.toLowerCase() || '';
            return pipeline === '' ? `pipelines` : `pipelines/results/${pipeline}`;
        case 'DEPLOY':
            const deploy = fragments[2]?.toLowerCase() || '';
            return deploy === '' ? `deployments` : `deployments/${deploy}`;
        case 'COMPARE':
            const branchFrom = fragments[2] || '';
            if (branchFrom === '' || fragments[3]?.toUpperCase() !== 'TO') {
                notifyUser('Invalid command', 'Please use "repo COMPARE {branch} TO {compare}"');
                return `branches/compare`;
            }
            return `branches/compare/${branchFrom}%0D${fragments[4] || ''}`;
        case 'DIFF':
            const branchDiff = fragments[2] || '';
            if (branchDiff === '') {
                notifyUser('No branch name', 'Please enter a branch name');
                return `branches`;
            }
            if (fragments[3]?.toUpperCase() === 'TO') {
                return `branch/${branchDiff}?dest=${fragments[4] || ''}`;
            }
            return `branch/${branchDiff}`;
        default:
            return 'overview/';
    }
}

/* Tabs */
function openTab(url, tabOverride) {
    const openInNewTab = tabOverride
        ? tabOverride === 'NEW'
        : bitbucketQueryData.config.tabBehaviour === 'new';
    if (openInNewTab) {
        chrome.tabs.create({url: url, active: true, index: 50});
    } else {
        chrome.tabs.update({url: url});
    }
}

/* Notifications */
function notifyUser(title, message, requireInteraction = false) {
    console.log('📣', title, message);
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'logo128.png',
        title: title,
        message: message,
        priority: 0,
        requireInteraction: requireInteraction
    });
}

/* Local storage */
function saveToLocalStorage() {
    chrome.storage.local.set(bitbucketQueryData).then(() => {
        console.log(bitbucketQueryData, "Data is set to local storage");
    });
    refreshContextMenu();
}

/* Text utility */
function escapeHtml(str) {
    return str.replace(/[&<>"']/g, function (match) {
        switch (match) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '"': return '&quot;';
            case "'": return '&#39;';
        }
    });
}
