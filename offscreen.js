const textarea = document.getElementById('clipboard');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.target !== 'offscreen') {
        return false;
    }
    if (message.type === 'copy-to-clipboard') {
        copyToClipboard(message.data);
        sendResponse({copied: true});
    }
    return false;
});

function copyToClipboard(text) {
    textarea.value = text;
    textarea.select();
    document.execCommand('copy');
}
