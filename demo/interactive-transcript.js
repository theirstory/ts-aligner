/**
 * Interactive Transcript Module
 * Handles video playback synchronized with Hyperaudio Lite transcript
 */

class InteractiveTranscript {
  constructor(videoElementId, transcriptElementId) {
    this.videoElement = document.getElementById(videoElementId);
    this.transcriptElement = document.getElementById(transcriptElementId);
    this.hyperaudioInstance = null;
    this.videoUrl = null;
  }

  /**
   * Load a video from a signed URL (like S3 signed URLs)
   */
  async loadVideo(signedUrl, useBlob = false) {
    if (!signedUrl || !this.videoElement) {
      throw new Error('Video URL and video element are required');
    }

    this.videoUrl = signedUrl;

    try {
      if (useBlob) {
        // Use blob approach for better compatibility with signed URLs
        const response = await fetch(signedUrl);
        
        if (!response.ok) {
          throw new Error(`Failed to load video: ${response.status} ${response.statusText}`);
        }

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        
        this.videoElement.src = blobUrl;
        this.videoElement.style.display = 'block';

        // Clean up the blob URL when video is done loading
        this.videoElement.addEventListener('loadeddata', () => {
          console.log('Video loaded successfully');
        }, { once: true });
      } else {
        // Direct approach - just set the src, let the browser handle it
        // This works better with signed URLs that have strict CORS policies
        this.videoElement.src = signedUrl;
        this.videoElement.style.display = 'block';
        
        // Wait for the video to load
        await new Promise((resolve, reject) => {
          const onLoad = () => {
            console.log('Video loaded successfully');
            resolve();
          };
          const onError = (e) => {
            reject(new Error('Failed to load video'));
          };
          
          this.videoElement.addEventListener('loadeddata', onLoad, { once: true });
          this.videoElement.addEventListener('error', onError, { once: true });
          
          // Timeout after 30 seconds
          setTimeout(() => {
            this.videoElement.removeEventListener('loadeddata', onLoad);
            this.videoElement.removeEventListener('error', onError);
            reject(new Error('Video loading timed out'));
          }, 30000);
        });
      }

      return true;
    } catch (error) {
      console.error('Error loading video:', error);
      throw error;
    }
  }

  /**
   * Initialize Hyperaudio Lite with the transcript HTML
   */
  initializeHyperaudio(transcriptHTML) {
    if (!this.transcriptElement) {
      throw new Error('Transcript element not found');
    }

    // Clear existing content
    this.transcriptElement.innerHTML = transcriptHTML;

    // Initialize Hyperaudio Lite
    // Parameters: transcriptId, playerId, minimizedMode, autoScroll, doubleClick, webMonetization, playOnClick
    this.hyperaudioInstance = new HyperaudioLite(
      this.transcriptElement.id,
      this.videoElement.id,
      false,  // minimizedMode
      false,  // autoScroll - disabled due to offset issues
      false,  // doubleClick
      false,  // webMonetization
      true    // playOnClick - click words to play
    );

    return this.hyperaudioInstance;
  }

  /**
   * Update the transcript content
   */
  updateTranscript(transcriptHTML) {
    if (this.hyperaudioInstance) {
      // Destroy existing instance if any
      // Note: HyperaudioLite doesn't have a destroy method, so we'll reinitialize
      this.initializeHyperaudio(transcriptHTML);
    } else {
      this.initializeHyperaudio(transcriptHTML);
    }
  }

  /**
   * Show error message
   */
  showError(message) {
    if (this.transcriptElement) {
      this.transcriptElement.innerHTML = `
        <div style="padding: 20px; background-color: #f8d7da; color: #721c24; border-radius: 4px;">
          <strong>Error:</strong> ${message}
        </div>
      `;
    }
  }

  /**
   * Show loading message
   */
  showLoading(message = 'Loading...') {
    if (this.transcriptElement) {
      this.transcriptElement.innerHTML = `
        <div style="padding: 20px; text-align: center; color: #666;">
          ${message}
        </div>
      `;
    }
  }

  /**
   * Clear the video
   */
  clearVideo() {
    if (this.videoElement) {
      this.videoElement.src = '';
      this.videoElement.style.display = 'none';
    }
    this.videoUrl = null;
  }

  /**
   * Clear the transcript
   */
  clearTranscript() {
    if (this.transcriptElement) {
      this.transcriptElement.innerHTML = '';
    }
    this.hyperaudioInstance = null;
  }
}

