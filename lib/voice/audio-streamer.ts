/**
 * Streaming audio player for Nova Sonic voice responses.
 * Plays 16-bit LE PCM chunks as they arrive via SSE.
 *
 * Strategy:
 * - Pre-buffer first ~300ms of audio before starting playback
 * - Merge small chunks into larger ones to reduce scheduling overhead
 * - Resume suspended AudioContext (mobile browsers require gesture)
 * - Schedule with safety margin to handle network jitter
 */
export class AudioStreamer {
  private ctx: AudioContext | null = null;
  private sampleRate: number;
  private nextTime = 0;
  private playbackStarted = false;
  private endCallbacks: (() => void)[] = [];
  private pending = 0;
  private closed = false;

  // Pre-buffering: collect chunks until we have enough to start smoothly
  private preBuffer: Float32Array[] = [];
  private preBufferSamples = 0;
  private readonly PRE_BUFFER_SAMPLES: number; // ~300ms worth

  // Merge small chunks into bigger ones for fewer AudioBufferSourceNodes
  private mergeBuffer: Float32Array | null = null;
  private mergeOffset = 0;
  private readonly MERGE_TARGET: number; // ~100ms worth

  constructor(sampleRate = 24000) {
    this.sampleRate = sampleRate;
    this.PRE_BUFFER_SAMPLES = Math.floor(sampleRate * 0.3); // 300ms
    this.MERGE_TARGET = Math.floor(sampleRate * 0.1); // 100ms
  }

  /** Ensure AudioContext is created and running */
  private async ensureContext(): Promise<AudioContext> {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: this.sampleRate });
    }
    // Mobile browsers suspend AudioContext until user gesture
    if (this.ctx.state === "suspended") {
      try { await this.ctx.resume(); } catch { /* ignore */ }
    }
    return this.ctx;
  }

  /** Decode base64 PCM chunk to Float32Array samples */
  private decode(base64Chunk: string): Float32Array | null {
    const raw = atob(base64Chunk);
    if (raw.length < 2) return null;

    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

    const samples = new Float32Array(bytes.length / 2);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = view.getInt16(i * 2, true) / 32768;
    }
    return samples;
  }

  /** Schedule a block of samples for gapless playback */
  private scheduleBlock(samples: Float32Array): void {
    if (!this.ctx || samples.length === 0) return;

    const buffer = this.ctx.createBuffer(1, samples.length, this.ctx.sampleRate);
    buffer.getChannelData(0).set(samples);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);

    const now = this.ctx.currentTime;
    // First block: start 100ms from now for safety margin
    // Subsequent blocks: schedule right after previous, but never in the past
    const startAt = this.playbackStarted
      ? Math.max(this.nextTime, now + 0.01) // 10ms minimum gap to avoid glitches
      : now + 0.1; // 100ms initial delay

    source.start(startAt);
    this.nextTime = startAt + buffer.duration;
    this.playbackStarted = true;
    this.pending++;

    source.onended = () => {
      this.pending--;
      if (this.pending <= 0 && this.closed) {
        this.endCallbacks.forEach((cb) => cb());
      }
    };
  }

  /** Flush the merge buffer as a scheduled block */
  private flushMerge(): void {
    if (this.mergeBuffer && this.mergeOffset > 0) {
      this.scheduleBlock(this.mergeBuffer.subarray(0, this.mergeOffset));
      this.mergeBuffer = null;
      this.mergeOffset = 0;
    }
  }

  /** Add samples to merge buffer, flushing when full */
  private addToMerge(samples: Float32Array): void {
    if (!this.mergeBuffer) {
      this.mergeBuffer = new Float32Array(this.MERGE_TARGET);
    }

    let srcOffset = 0;
    while (srcOffset < samples.length) {
      const remaining = this.mergeBuffer.length - this.mergeOffset;
      const toCopy = Math.min(remaining, samples.length - srcOffset);
      this.mergeBuffer.set(samples.subarray(srcOffset, srcOffset + toCopy), this.mergeOffset);
      this.mergeOffset += toCopy;
      srcOffset += toCopy;

      if (this.mergeOffset >= this.mergeBuffer.length) {
        this.flushMerge();
        this.mergeBuffer = new Float32Array(this.MERGE_TARGET);
        this.mergeOffset = 0;
      }
    }
  }

  /** Feed a base64-encoded PCM chunk (16-bit LE mono) */
  feed(base64Chunk: string): void {
    if (this.closed) return;

    const samples = this.decode(base64Chunk);
    if (!samples) return;

    // Ensure AudioContext exists (fire-and-forget resume)
    void this.ensureContext();

    // Phase 1: Pre-buffering — collect until we have enough for smooth start
    if (!this.playbackStarted) {
      this.preBuffer.push(samples);
      this.preBufferSamples += samples.length;

      if (this.preBufferSamples >= this.PRE_BUFFER_SAMPLES) {
        // Flush entire pre-buffer as one big block
        const merged = new Float32Array(this.preBufferSamples);
        let offset = 0;
        for (const chunk of this.preBuffer) {
          merged.set(chunk, offset);
          offset += chunk.length;
        }
        this.preBuffer = [];
        this.preBufferSamples = 0;
        this.scheduleBlock(merged);
      }
      return;
    }

    // Phase 2: Streaming — merge small chunks, schedule when full
    this.addToMerge(samples);
  }

  /** Signal that no more chunks will arrive. Fires onEnd when last chunk finishes. */
  finish(): void {
    this.closed = true;

    // Flush any remaining pre-buffer (short responses)
    if (this.preBuffer.length > 0 && this.preBufferSamples > 0) {
      void this.ensureContext().then(() => {
        const merged = new Float32Array(this.preBufferSamples);
        let offset = 0;
        for (const chunk of this.preBuffer) {
          merged.set(chunk, offset);
          offset += chunk.length;
        }
        this.preBuffer = [];
        this.preBufferSamples = 0;
        this.scheduleBlock(merged);

        // Also flush merge buffer
        this.flushMerge();

        if (this.pending <= 0) {
          this.endCallbacks.forEach((cb) => cb());
        }
      });
      return;
    }

    // Flush remaining merge buffer
    this.flushMerge();

    if (this.pending <= 0) {
      this.endCallbacks.forEach((cb) => cb());
    }
  }

  /** Register callback for when all audio finishes playing */
  onEnd(callback: () => void): void {
    this.endCallbacks.push(callback);
  }

  /** Stop playback and release resources */
  async stop(): Promise<void> {
    this.closed = true;
    if (this.ctx) {
      try { await this.ctx.close(); } catch { /* already closed */ }
      this.ctx = null;
    }
  }

  get isPlaying(): boolean {
    return this.pending > 0;
  }
}
