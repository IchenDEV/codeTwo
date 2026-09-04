export async function toWav16kMono(blob: Blob): Promise<Uint8Array> {
  const bytes = await blob.arrayBuffer();
  const context = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(bytes);
  } finally {
    void context.close();
  }

  const rate = 16_000;
  const frames = Math.max(1, Math.round(decoded.duration * rate));
  // The three-argument form: Safari never gained the options-object constructor.
  const offline = new OfflineAudioContext(1, frames, rate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination); // multi-channel input is downmixed to the mono destination
  source.start();
  const rendered = await offline.startRendering();

  return encodeWav(rendered.getChannelData(0), rate);
}

function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index++) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // format: PCM
  view.setUint16(22, 1, true); // channels
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 8 * bytesPerSample, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);

  for (const [index, sample] of samples.entries()) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(
      44 + index * bytesPerSample,
      clamped < 0 ? clamped * 0x80_00 : clamped * 0x7f_ff,
      true
    );
  }
  return new Uint8Array(buffer);
}

export function preferredRecordingType(): string | undefined {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/aac",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported?.(t));
}
