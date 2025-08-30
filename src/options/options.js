// Cross-browser compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

document.addEventListener('DOMContentLoaded', function() {
  const defaultFolderInput = document.getElementById('default-folder');
  const chunkSizeSelect = document.getElementById('chunk-size');
  const clearDataButton = document.getElementById('clear-data');
  const saveButton = document.getElementById('save-button');
  const cancelButton = document.getElementById('cancel-button');
  
  // Load saved settings
  loadSettings();
  
  // Handle save button click
  saveButton.addEventListener('click', saveSettings);
  
  // Handle cancel button click
  cancelButton.addEventListener('click', function() {
    window.close();
  });
  
  // Handle clear data button click
  clearDataButton.addEventListener('click', function() {
    if (confirm('Are you sure you want to clear all upload data? This cannot be undone.')) {
      browserAPI.storage.local.clear(function() {
        alert('All upload data has been cleared.');
      });
    }
  });
  
  // Load settings from storage
  function loadSettings() {
    browserAPI.storage.local.get(['settings'], function(result) {
      const settings = result.settings || {};
      
      if (settings.defaultFolderId) {
        defaultFolderInput.value = settings.defaultFolderId;
      }
      
      if (settings.chunkSize) {
        chunkSizeSelect.value = settings.chunkSize;
      }
    });
  }
  
  // Save settings to storage
  function saveSettings() {
    const settings = {
      defaultFolderId: defaultFolderInput.value.trim() || null,
      chunkSize: parseInt(chunkSizeSelect.value, 10)
    };
    
    browserAPI.storage.local.set({ settings: settings }, function() {
      alert('Settings saved successfully.');
      window.close();
    });
  }
});