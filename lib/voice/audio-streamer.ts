/**
 * Streaming audio player for Nova Sonic voice responses.
 * Plays 16-bit LE PCM chunks as they arrive via SSE,
 * scheduling them gaplessly on AudioContext for smooth real-time playback.
 */
export class AudioStreamer {
  private ctx: AudioContext;
  private nextTime = 0;
  private started = false;
  private endCallbacks: (() => void)[] = [];
  private pending = 0;
  private closed = false;

  constructor(sampleRate = 24000) {
    this.ctx = new AudioContext({ sampleRate });
  }

  /** Feed a base64-encoded PCM chunk (16-bit LE mono) */
  feed(base64Chunk: string): void {
    if (this.closed) return;

    const raw = atob(base64Chunk);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    if (bytes.length < 2) return;

    const samples = new Float32Array(bytes.length / 2);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = view.getInt16(i * 2, true) / 32768;
    }

    const buffer = this.ctx.createBuffer(1, samples.length, this.ctx.sampleRate);
    buffer.getChannelData(0).set(samples);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);

    const now = this.ctx.currentTime;
    // Small initial buffer (50ms) to prevent underrun
    const startAt = this.started ? Math.max(this.nextTime, now) : now + 0.05;
    source.start(startAt);
    this.nextTime = startAt + buffer.duration;
    this.started = true;
    this.pending++;

    source.onended = () => {
      this.pending--;
      if (this.pending <= 0 && this.closed) {
        this.endCallbacks.forEach((cb) => cb());
      }
    };
  }

  /** Signal that no more chunks will arrive. Fires onEnd when last chunk finishes. */
  finish(): void {
    this.closed = true;
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
    try { await this.ctx.close(); } catch { /* already closed */ }
  }

  get isPlaying(): boolean {
    return this.pending > 0;
  }
}
