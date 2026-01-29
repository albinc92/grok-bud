import { grokApi } from './api';
import * as storage from './storage';
import type { VideoJob } from './types';

type JobUpdateCallback = (job: VideoJob) => void;

/**
 * Manages background video generation jobs.
 * Polls pending jobs and updates storage when complete.
 */
class VideoJobManager {
  private pollingIntervalId: number | null = null;
  private pollingIntervalMs = 5000; // 5 seconds
  private maxAttempts = 120; // 10 minutes max (120 * 5s)
  private attemptCounts: Map<string, number> = new Map();
  private onUpdateCallbacks: Set<JobUpdateCallback> = new Set();

  /**
   * Start the background polling loop
   */
  start(): void {
    if (this.pollingIntervalId !== null) return;

    // Initial check
    this.pollPendingJobs();

    // Start polling
    this.pollingIntervalId = window.setInterval(() => {
      this.pollPendingJobs();
    }, this.pollingIntervalMs);

    console.log('[VideoJobManager] Started background polling');
  }

  /**
   * Stop the background polling loop
   */
  stop(): void {
    if (this.pollingIntervalId !== null) {
      window.clearInterval(this.pollingIntervalId);
      this.pollingIntervalId = null;
      console.log('[VideoJobManager] Stopped background polling');
    }
  }

  /**
   * Register a callback to be notified when a job updates
   */
  onUpdate(callback: JobUpdateCallback): () => void {
    this.onUpdateCallbacks.add(callback);
    return () => this.onUpdateCallbacks.delete(callback);
  }

  /**
   * Notify all listeners of a job update
   */
  private notifyUpdate(job: VideoJob): void {
    this.onUpdateCallbacks.forEach(cb => {
      try {
        cb(job);
      } catch (e) {
        console.error('[VideoJobManager] Callback error:', e);
      }
    });
  }

  /**
   * Start a new video generation job
   */
  async startJob(postId: string, prompt: string, imageUrl: string, duration: number): Promise<VideoJob | null> {
    try {
      const response = await grokApi.generateVideo(prompt, {
        image: { url: imageUrl },
        duration
      });

      const job: VideoJob = {
        id: response.request_id,
        postId,
        prompt,
        duration,
        status: 'pending',
        startedAt: Date.now()
      };

      storage.addVideoJob(job);
      this.attemptCounts.set(job.id, 0);
      
      console.log('[VideoJobManager] Started job:', job.id);
      
      // Immediately poll this job
      this.pollJob(job);
      
      return job;
    } catch (error) {
      console.error('[VideoJobManager] Failed to start job:', error);
      return null;
    }
  }

  /**
   * Poll all pending jobs
   */
  private async pollPendingJobs(): Promise<void> {
    const pendingJobs = storage.getPendingVideoJobs();
    
    if (pendingJobs.length === 0) return;

    console.log(`[VideoJobManager] Polling ${pendingJobs.length} pending job(s)`);

    // Poll each job in parallel
    await Promise.all(pendingJobs.map(job => this.pollJob(job)));
  }

  /**
   * Poll a single job for status
   */
  private async pollJob(job: VideoJob): Promise<void> {
    const attempts = this.attemptCounts.get(job.id) || 0;

    if (attempts >= this.maxAttempts) {
      // Timeout - mark as error
      const updatedJob: VideoJob = {
        ...job,
        status: 'error',
        errorMessage: 'Video generation timed out',
        completedAt: Date.now()
      };
      storage.updateVideoJob(job.id, updatedJob);
      this.attemptCounts.delete(job.id);
      this.notifyUpdate(updatedJob);
      console.log('[VideoJobManager] Job timed out:', job.id);
      return;
    }

    try {
      const status = await grokApi.getVideoStatus(job.id);
      console.log('[VideoJobManager] Status response for', job.id, ':', JSON.stringify(status));
      this.attemptCounts.set(job.id, attempts + 1);

      if (status.status === 'done' && status.video?.url) {
        // Success! Save video to the post
        try {
          storage.addVideoToPost(job.postId, {
            url: status.video.url,
            prompt: job.prompt,
            duration: job.duration
          });
          console.log('[VideoJobManager] Video saved to post:', job.postId);
        } catch (e) {
          console.error('[VideoJobManager] Failed to save video to post:', e);
        }

        const updatedJob: VideoJob = {
          ...job,
          status: 'done',
          videoUrl: status.video.url,
          completedAt: Date.now()
        };
        storage.updateVideoJob(job.id, updatedJob);
        this.attemptCounts.delete(job.id);
        this.notifyUpdate(updatedJob);
        console.log('[VideoJobManager] Job completed:', job.id);
      }
      // If still pending, do nothing - will poll again next interval
    } catch (error) {
      console.error('[VideoJobManager] Error polling job:', job.id, error);
      
      // After 3 consecutive errors, mark as failed
      const errorCount = (this.attemptCounts.get(job.id + '_errors') || 0) + 1;
      this.attemptCounts.set(job.id + '_errors', errorCount);

      if (errorCount >= 3) {
        const updatedJob: VideoJob = {
          ...job,
          status: 'error',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          completedAt: Date.now()
        };
        storage.updateVideoJob(job.id, updatedJob);
        this.attemptCounts.delete(job.id);
        this.attemptCounts.delete(job.id + '_errors');
        this.notifyUpdate(updatedJob);
      }
    }
  }

  /**
   * Get the current job for a post (if any)
   */
  getJobForPost(postId: string): VideoJob | undefined {
    return storage.getVideoJobForPost(postId);
  }

  /**
   * Check if there are any pending jobs
   */
  hasPendingJobs(): boolean {
    return storage.getPendingVideoJobs().length > 0;
  }
}

// Singleton instance
export const videoJobManager = new VideoJobManager();
