export const DEFAULT_VOICE_MESSAGE_LIMITS = {
  maxDurationSeconds: 300,
  maxFileSizeMb: 10,
  waveformBars: 36
};

const FALLBACK_WAVEFORM = [
  20, 28, 44, 58, 42, 34, 24, 36, 48, 62, 52, 38, 26, 18, 24, 40, 56, 64,
  60, 48, 30, 22, 18, 26, 36, 50, 62, 54, 42, 28, 22, 18
];

export const SUPPORTED_VOICE_MESSAGE_TYPES = [
  "audio/ogg",
  "audio/ogg;codecs=opus",
  "audio/mpeg",
  "audio/mp3",
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/wave"
];

export function clamp(number, min, max) {
  return Math.min(Math.max(number, min), max);
}

export function formatAudioTime(totalSeconds = 0) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}:${String(minutes % 60).padStart(2, "0")}:${String(
      seconds
    ).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function getVoiceExtensionFromMimeType(mimeType = "") {
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) {
    return "mp3";
  }

  if (mimeType.includes("ogg")) {
    return "ogg";
  }

  if (mimeType.includes("wav")) {
    return "wav";
  }

  if (mimeType.includes("mp4") || mimeType.includes("m4a")) {
    return "m4a";
  }

  if (mimeType.includes("webm")) {
    return "webm";
  }

  return "ogg";
}

export function isAudioUrl(url = "") {
  return /\.(mp3|ogg|wav|m4a|aac|webm|mp4)(\?.*)?$/i.test(url);
}

export function isAudioMimeType(mimeType = "") {
  return mimeType.startsWith("audio/");
}

export function normalizeWaveform(waveform, bars = DEFAULT_VOICE_MESSAGE_LIMITS.waveformBars) {
  if (!Array.isArray(waveform) || waveform.length === 0) {
    return getFallbackWaveform(bars);
  }

  return waveform
    .slice(0, bars)
    .map(value => clamp(Number(value) || 0, 12, 100));
}

export function getFallbackWaveform(
  bars = DEFAULT_VOICE_MESSAGE_LIMITS.waveformBars
) {
  return Array.from({ length: bars }, (_, index) => {
    const fallbackValue =
      FALLBACK_WAVEFORM[index % FALLBACK_WAVEFORM.length] || 24;
    return clamp(fallbackValue, 12, 100);
  });
}

export function normalizeVoiceMessage(voiceMessage = {}) {
  const url =
    voiceMessage.url ||
    voiceMessage.src ||
    voiceMessage.downloadUrl ||
    voiceMessage.fileUrl ||
    "";
  const mimeType =
    voiceMessage.mimeType ||
    voiceMessage.type ||
    (voiceMessage.file && voiceMessage.file.type) ||
    "";
  const duration = Number(
    voiceMessage.duration || voiceMessage.durationSeconds || 0
  );
  const waveform = normalizeWaveform(voiceMessage.waveform);

  return {
    ...voiceMessage,
    url,
    mimeType,
    duration: Number.isFinite(duration) ? duration : 0,
    fileName:
      voiceMessage.fileName ||
      voiceMessage.name ||
      (voiceMessage.file && voiceMessage.file.name) ||
      `voice-message.${getVoiceExtensionFromMimeType(mimeType)}`,
    waveform,
    transcript: voiceMessage.transcript || "",
    transcriptStatus: voiceMessage.transcriptStatus || "idle",
    listened: Boolean(voiceMessage.listened)
  };
}

export async function getAudioDurationFromUrl(url) {
  if (!url || typeof window === "undefined") {
    return 0;
  }

  return new Promise(resolve => {
    const audio = new Audio();

    const finalize = duration => {
      audio.removeAttribute("src");
      audio.load();
      resolve(duration);
    };

    audio.preload = "metadata";
    audio.onloadedmetadata = () => finalize(audio.duration || 0);
    audio.onerror = () => finalize(0);
    audio.src = url;
  });
}

export async function generateWaveformFromBlob(
  blob,
  bars = DEFAULT_VOICE_MESSAGE_LIMITS.waveformBars
) {
  if (!blob || typeof window === "undefined") {
    return getFallbackWaveform(bars);
  }

  const AudioContextConstructor =
    window.AudioContext || window.webkitAudioContext;

  if (!AudioContextConstructor) {
    return getFallbackWaveform(bars);
  }

  const audioContext = new AudioContextConstructor();

  try {
    const source = await blob.arrayBuffer();
    const audioBuffer = await new Promise((resolve, reject) => {
      const clonedBuffer = source.slice(0);
      const decoded = audioContext.decodeAudioData(
        clonedBuffer,
        resolvedBuffer => resolve(resolvedBuffer),
        rejectedError => reject(rejectedError)
      );

      if (decoded && typeof decoded.then === "function") {
        decoded.then(resolve).catch(reject);
      }
    });

    const samples = audioBuffer.getChannelData(0);
    const blockSize = Math.max(1, Math.floor(samples.length / bars));
    const filtered = Array.from({ length: bars }, (_, index) => {
      const start = index * blockSize;
      const end = Math.min(start + blockSize, samples.length);
      let sum = 0;

      for (let cursor = start; cursor < end; cursor += 1) {
        sum += Math.abs(samples[cursor]);
      }

      return sum / Math.max(1, end - start);
    });

    const peak = Math.max(...filtered, 0.01);
    return filtered.map(value =>
      clamp(Math.round((value / peak) * 100), 12, 100)
    );
  } catch (error) {
    return getFallbackWaveform(bars);
  } finally {
    if (typeof audioContext.close === "function") {
      await audioContext.close();
    }
  }
}
