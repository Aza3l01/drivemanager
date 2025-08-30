// Cross-browser compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

document.addEventListener('DOMContentLoaded', function() {
  const authButton = document.getElementById('auth-button');
  const optionsButton = document.getElementById('options-button');
  const selectFilesButton = document.getElementById('select-files');
  const fileInput = document.getElementById('file-input');
  const uploadsContainer = document.getElementById('uploads-container');
  const selectedFilesContainer = document.getElementById('selected-files');
  
  let isAuthenticated = false;
  let selectedFiles = [];
  
  // Initialize the UI
  init();
  
  // Check authentication status
  function checkAuthStatus() {
    browserAPI.identity.getAuthToken({ interactive: false }, function(token) {
      isAuthenticated = !!token;
      updateAuthUI();
      
      if (isAuthenticated) {
        loadUploads();
      }
    });
  }
  
  // Update authentication UI
  function updateAuthUI() {
    if (isAuthenticated) {
      authButton.textContent = 'Signed in';
      authButton.disabled = true;
      selectFilesButton.disabled = false;
    } else {
      authButton.textContent = 'Sign in with Google';
      authButton.disabled = false;
      selectFilesButton.disabled = true;
    }
  }
  
  // Handle authentication
  authButton.addEventListener('click', function() {
    browserAPI.identity.getAuthToken({ interactive: true }, function(token) {
      if (browserAPI.runtime.lastError) {
        console.error('Auth error:', browserAPI.runtime.lastError);
        authButton.textContent = 'Sign in failed. Try again.';
      } else {
        isAuthenticated = true;
        updateAuthUI();
        loadUploads();
      }
    });
  });
  
  // Open options page
  optionsButton.addEventListener('click', function() {
    browserAPI.runtime.openOptionsPage();
  });
  
  // Handle file selection
  selectFilesButton.addEventListener('click', function() {
    fileInput.click();
  });
  
  fileInput.addEventListener('change', function(e) {
    selectedFiles = Array.from(e.target.files);
    displaySelectedFiles();
  });
  
  // Display selected files
  function displaySelectedFiles() {
    selectedFilesContainer.innerHTML = '';
    
    selectedFiles.forEach(file => {
      const fileElement = document.createElement('div');
      fileElement.className = 'selected-file';
      fileElement.textContent = `${file.name} (${formatFileSize(file.size)})`;
      selectedFilesContainer.appendChild(fileElement);
    });
    
    // Add upload button if files are selected
    if (selectedFiles.length > 0) {
      const uploadButton = document.createElement('button');
      uploadButton.textContent = `Upload ${selectedFiles.length} File(s)`;
      uploadButton.className = 'primary-button';
      uploadButton.addEventListener('click', startUploads);
      selectedFilesContainer.appendChild(uploadButton);
    }
  }
  
  // Start uploading selected files
  function startUploads() {
    selectedFiles.forEach(file => {
      browserAPI.runtime.sendMessage(
        { 
          action: 'startUpload', 
          file: {
            name: file.name,
            size: file.size,
            type: file.type,
            lastModified: file.lastModified
          }
        },
        function(response) {
          if (response.error) {
            console.error('Upload error:', response.error);
            alert(`Failed to start upload: ${response.error}`);
          } else {
            // Upload started successfully
            loadUploads();
          }
        }
      );
    });
    
    // Clear selection
    selectedFiles = [];
    fileInput.value = '';
    displaySelectedFiles();
  }
  
  // Load and display active uploads
  function loadUploads() {
    browserAPI.runtime.sendMessage(
      { action: 'getUploads' },
      function(response) {
        displayUploads(response);
      }
    );
  }
  
  // Display uploads in the UI
  function displayUploads(uploads) {
    if (!uploads || uploads.length === 0) {
      uploadsContainer.innerHTML = '<div class="empty-state">No active uploads</div>';
      return;
    }
    
    uploadsContainer.innerHTML = '';
    
    uploads.forEach(upload => {
      const uploadElement = createUploadElement(upload);
      uploadsContainer.appendChild(uploadElement);
    });
  }
  
  // Create UI element for an upload
  function createUploadElement(upload) {
    const element = document.createElement('div');
    element.className = 'upload-item';
    element.dataset.uploadId = upload.id;
    
    const progressPercent = upload.progress || 0;
    const uploadedSize = formatFileSize(upload.uploadedBytes);
    const totalSize = formatFileSize(upload.file.size);
    
    element.innerHTML = `
      <div class="upload-header">
        <span class="upload-name" title="${upload.file.name}">${upload.file.name}</span>
        <span class="upload-status status-${upload.status}">${upload.status}</span>
      </div>
      <div class="upload-progress">
        <div class="progress-bar" style="width: ${progressPercent}%"></div>
      </div>
      <div class="upload-details">
        <span>${uploadedSize} / ${totalSize}</span>
        <span>${Math.round(progressPercent)}%</span>
      </div>
      <div class="upload-controls">
        ${upload.status === 'uploading' ? 
          `<button class="control-button pause-btn">Pause</button>` : 
          `<button class="control-button resume-btn">Resume</button>`
        }
        <button class="control-button cancel-btn">Cancel</button>
      </div>
      ${upload.error ? `<div class="upload-error" style="color: #c5221f; font-size: 11px; margin-top: 8px;">Error: ${upload.error}</div>` : ''}
    `;
    
    // Add event listeners to control buttons
    const pauseResumeBtn = element.querySelector('.pause-btn, .resume-btn');
    const cancelBtn = element.querySelector('.cancel-btn');
    
    if (pauseResumeBtn) {
      pauseResumeBtn.addEventListener('click', function() {
        if (upload.status === 'uploading') {
          pauseUpload(upload.id);
        } else {
          resumeUpload(upload.id);
        }
      });
    }
    
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function() {
        cancelUpload(upload.id);
      });
    }
    
    return element;
  }
  
  // Pause an upload
  function pauseUpload(uploadId) {
    browserAPI.runtime.sendMessage(
      { action: 'pauseUpload', uploadId: uploadId },
      function(response) {
        if (response.success) {
          loadUploads(); // Refresh the list
        } else if (response.error) {
          console.error('Pause error:', response.error);
        }
      }
    );
  }
  
  // Resume an upload
  function resumeUpload(uploadId) {
    browserAPI.runtime.sendMessage(
      { action: 'resumeUpload', uploadId: uploadId },
      function(response) {
        if (response.success) {
          loadUploads(); // Refresh the list
        } else if (response.error) {
          console.error('Resume error:', response.error);
        }
      }
    );
  }
  
  // Cancel an upload
  function cancelUpload(uploadId) {
    if (confirm('Are you sure you want to cancel this upload?')) {
      browserAPI.runtime.sendMessage(
        { action: 'cancelUpload', uploadId: uploadId },
        function(response) {
          if (response.success) {
            loadUploads(); // Refresh the list
          } else if (response.error) {
            console.error('Cancel error:', response.error);
          }
        }
      );
    }
  }
  
  // Format file size for display
  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  // Initialize the UI
  function init() {
    checkAuthStatus();
    
    // Set up periodic refresh
    setInterval(loadUploads, 2000);
    
    // Listen for messages from background script
    browserAPI.runtime.onMessage.addListener(function(request) {
      if (request.type === 'uploadUpdated') {
        loadUploads();
      }
    });
  }
});