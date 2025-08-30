// Cross-browser compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Upload manager class
class UploadManager {
  constructor() {
    this.activeUploads = new Map();
    this.initialize();
  }

  async initialize() {
    await this.loadPersistedState();
    this.recoverInterruptedUploads();
    this.setupMessageHandlers();
  }

  // Load upload state from storage
  async loadPersistedState() {
    try {
      const data = await browserAPI.storage.local.get(['uploads']);
      if (data.uploads) {
        const uploads = JSON.parse(data.uploads);
        uploads.forEach(upload => {
          this.activeUploads.set(upload.id, upload);
        });
      }
    } catch (error) {
      console.error('Error loading persisted state:', error);
    }
  }

  // Save upload state to storage
  async savePersistedState() {
    try {
      const uploads = Array.from(this.activeUploads.values());
      await browserAPI.storage.local.set({
        uploads: JSON.stringify(uploads)
      });
    } catch (error) {
      console.error('Error saving persisted state:', error);
    }
  }

  // Recover uploads that were interrupted
  async recoverInterruptedUploads() {
    for (const [id, upload] of this.activeUploads) {
      if (upload.status === 'uploading' || upload.status === 'paused') {
        // Mark as interrupted to allow manual resume
        upload.status = 'interrupted';
        this.activeUploads.set(id, upload);
      }
    }
    await this.savePersistedState();
  }

  // Start a new upload
  async startUpload(file, folderId = null) {
    const uploadId = this.generateUploadId();
    
    const upload = {
      id: uploadId,
      file: {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified
      },
      status: 'initializing',
      progress: 0,
      uploadedBytes: 0,
      chunkSize: 5 * 1024 * 1024, // 5MB chunks
      folderId: folderId,
      chunks: [],
      sessionUri: null,
      startTime: Date.now(),
      error: null
    };

    this.activeUploads.set(uploadId, upload);
    await this.savePersistedState();

    // Start the upload process
    this.processUpload(uploadId, file);
    
    return uploadId;
  }

  // Generate a unique upload ID
  generateUploadId() {
    return `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Main upload processing method
  async processUpload(uploadId, file) {
    const upload = this.activeUploads.get(uploadId);
    if (!upload) return;

    try {
      // Get authentication token
      const token = await this.getAuthToken();
      if (!token) {
        throw new Error('Authentication required');
      }

      // Initialize resumable upload session if not already done
      if (!upload.sessionUri) {
        upload.sessionUri = await this.initResumableUpload(upload, token);
        upload.status = 'uploading';
        this.activeUploads.set(uploadId, upload);
        await this.savePersistedState();
      }

      // Upload chunks
      await this.uploadChunks(uploadId, file, token);

      // Finalize upload if all chunks are done
      if (upload.uploadedBytes >= upload.file.size) {
        upload.status = 'completed';
        upload.endTime = Date.now();
        this.activeUploads.set(uploadId, upload);
        await this.savePersistedState();
        
        // Notify UI of completion
        this.sendUpdateToUI(uploadId);
      }

    } catch (error) {
      console.error('Upload error:', error);
      upload.status = 'error';
      upload.error = error.message;
      this.activeUploads.set(uploadId, upload);
      await this.savePersistedState();
      this.sendUpdateToUI(uploadId);
    }
  }

  // Initialize a resumable upload session with Google Drive
  async initResumableUpload(upload, token) {
    const metadata = {
      name: upload.file.name,
      mimeType: upload.file.type,
      ...(upload.folderId && { parents: [upload.folderId] })
    };

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': upload.file.type,
          'X-Upload-Content-Length': upload.file.size.toString()
        },
        body: JSON.stringify(metadata)
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to initialize upload: ${response.statusText}`);
    }

    return response.headers.get('Location');
  }

  // Upload chunks of the file
  async uploadChunks(uploadId, file, token) {
    const upload = this.activeUploads.get(uploadId);
    if (!upload || upload.status === 'paused') return;

    let startByte = upload.uploadedBytes;
    
    while (startByte < upload.file.size && upload.status === 'uploading') {
      const endByte = Math.min(startByte + upload.chunkSize, upload.file.size);
      const chunk = file.slice(startByte, endByte);
      
      try {
        await this.uploadChunk(uploadId, chunk, startByte, endByte, token);
        startByte = endByte;
        
        // Update progress
        upload.uploadedBytes = endByte;
        upload.progress = (endByte / upload.file.size) * 100;
        this.activeUploads.set(uploadId, upload);
        
        // Save progress and notify UI periodically
        if (endByte % (upload.chunkSize * 5) === 0 || endByte === upload.file.size) {
          await this.savePersistedState();
          this.sendUpdateToUI(uploadId);
        }
      } catch (error) {
        if (error.message.includes('pause')) {
          // Upload was paused
          upload.status = 'paused';
          this.activeUploads.set(uploadId, upload);
          await this.savePersistedState();
          this.sendUpdateToUI(uploadId);
          break;
        } else {
          // Other error, retry later
          console.warn('Chunk upload failed, will retry:', error);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retry
        }
      }
    }
  }

  // Upload a single chunk
  async uploadChunk(uploadId, chunk, startByte, endByte, token) {
    const upload = this.activeUploads.get(uploadId);
    if (!upload || !upload.sessionUri) {
      throw new Error('Upload session not found');
    }

    const contentRange = `bytes ${startByte}-${endByte - 1}/${upload.file.size}`;
    
    const response = await fetch(upload.sessionUri, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Range': contentRange,
        'Content-Type': 'application/octet-stream'
      },
      body: chunk
    });

    if (response.status === 308) {
      // Incomplete upload, continue with next chunk
      return;
    } else if (response.status === 200 || response.status === 201) {
      // Upload completed
      return;
    } else {
      throw new Error(`Upload failed with status: ${response.status}`);
    }
  }

  // Pause an upload
  async pauseUpload(uploadId) {
    const upload = this.activeUploads.get(uploadId);
    if (upload && upload.status === 'uploading') {
      upload.status = 'paused';
      this.activeUploads.set(uploadId, upload);
      await this.savePersistedState();
      this.sendUpdateToUI(uploadId);
      return true;
    }
    return false;
  }

  // Resume a paused upload
  async resumeUpload(uploadId) {
    const upload = this.activeUploads.get(uploadId);
    if (upload && (upload.status === 'paused' || upload.status === 'interrupted')) {
      upload.status = 'uploading';
      this.activeUploads.set(uploadId, upload);
      await this.savePersistedState();
      this.sendUpdateToUI(uploadId);
      
      // Get the file handle again (simplified - in real implementation, you'd need to store file reference)
      // For now, we'll assume the file is still accessible
      this.processUpload(uploadId, null); // File parameter would be needed in real implementation
      return true;
    }
    return false;
  }

  // Cancel an upload
  async cancelUpload(uploadId) {
    const upload = this.activeUploads.get(uploadId);
    if (upload) {
      // Try to delete the session from Google Drive
      if (upload.sessionUri) {
        try {
          const token = await this.getAuthToken();
          await fetch(upload.sessionUri, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
        } catch (error) {
          console.warn('Failed to delete upload session:', error);
        }
      }
      
      this.activeUploads.delete(uploadId);
      await this.savePersistedState();
      this.sendUpdateToUI(uploadId);
      return true;
    }
    return false;
  }

  // Get authentication token
  async getAuthToken() {
    return new Promise((resolve) => {
      browserAPI.identity.getAuthToken({ interactive: true }, (token) => {
        if (browserAPI.runtime.lastError) {
          console.error('Auth error:', browserAPI.runtime.lastError);
          resolve(null);
        } else {
          resolve(token);
        }
      });
    });
  }

  // Send update to UI
  sendUpdateToUI(uploadId) {
    const upload = this.activeUploads.get(uploadId);
    if (upload) {
      // Send message to all extension pages
      browserAPI.runtime.sendMessage({
        type: 'uploadUpdated',
        uploadId: uploadId,
        upload: upload
      }).catch(err => console.log('No listeners for update message'));
    }
  }

  // Setup message handlers for communication with UI
  setupMessageHandlers() {
    browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
      switch (request.action) {
        case 'getUploads':
          sendResponse(Array.from(this.activeUploads.values()));
          break;
        
        case 'startUpload':
          // In a real implementation, you'd get the file from the UI
          // This is a simplified version
          this.startUpload(request.file, request.folderId)
            .then(uploadId => sendResponse({ uploadId }))
            .catch(error => sendResponse({ error: error.message }));
          return true; // Will respond asynchronously
        
        case 'pauseUpload':
          this.pauseUpload(request.uploadId)
            .then(success => sendResponse({ success }))
            .catch(error => sendResponse({ error: error.message }));
          return true;
        
        case 'resumeUpload':
          this.resumeUpload(request.uploadId)
            .then(success => sendResponse({ success }))
            .catch(error => sendResponse({ error: error.message }));
          return true;
        
        case 'cancelUpload':
          this.cancelUpload(request.uploadId)
            .then(success => sendResponse({ success }))
            .catch(error => sendResponse({ error: error.message }));
          return true;
      }
    });
  }
}

// Initialize the upload manager
const uploadManager = new UploadManager();

// Keep service worker alive
setInterval(() => {
  // This keeps the service worker active
}, 1000 * 30); // 30 seconds