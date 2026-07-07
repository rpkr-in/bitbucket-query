const fileInput = document.getElementById('importFile');
const importBtn = document.getElementById('importBtn');
const importStatus = document.getElementById('importStatus');

fileInput.addEventListener('change', () => {
    importBtn.disabled = !fileInput.files.length;
    importStatus.textContent = '';
    importStatus.className = '';
});

importBtn.addEventListener('click', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            chrome.runtime.sendMessage({message: 'import_data', data}, (response) => {
                if (response?.roger) {
                    importStatus.textContent = '✓ Import successful! Your data has been restored.';
                    importStatus.className = 'success';
                } else {
                    importStatus.textContent = '✗ Import failed. The extension may not be ready yet — try again.';
                    importStatus.className = 'error';
                }
            });
        } catch (err) {
            importStatus.textContent = '✗ Invalid JSON file. Please select a valid bql-backup.json.';
            importStatus.className = 'error';
        }
    };
    reader.readAsText(file);
});
