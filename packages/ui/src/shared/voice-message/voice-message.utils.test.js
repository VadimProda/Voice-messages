import {
  formatAudioTime,
  getFallbackWaveform,
  getVoiceExtensionFromMimeType,
  normalizeVoiceMessage
} from "./voice-message.utils";

describe("voice-message utils", () => {
  test("formats audio time for minutes and hours", () => {
    expect(formatAudioTime(0)).toBe("0:00");
    expect(formatAudioTime(65)).toBe("1:05");
    expect(formatAudioTime(3665)).toBe("1:01:05");
  });

  test("maps mime types to expected file extensions", () => {
    expect(getVoiceExtensionFromMimeType("audio/ogg;codecs=opus")).toBe("ogg");
    expect(getVoiceExtensionFromMimeType("audio/mpeg")).toBe("mp3");
    expect(getVoiceExtensionFromMimeType("audio/webm")).toBe("webm");
  });

  test("normalizes voice payloads with defaults", () => {
    const normalized = normalizeVoiceMessage({
      durationSeconds: 24,
      mimeType: "audio/ogg",
      waveform: [4, 18, 120]
    });

    expect(normalized.duration).toBe(24);
    expect(normalized.fileName).toBe("voice-message.ogg");
    expect(normalized.waveform).toEqual([12, 18, 100]);
    expect(normalized.transcriptStatus).toBe("idle");
  });

  test("creates a fallback waveform with the requested size", () => {
    const waveform = getFallbackWaveform(12);

    expect(waveform).toHaveLength(12);
    waveform.forEach(value => {
      expect(value).toBeGreaterThanOrEqual(12);
      expect(value).toBeLessThanOrEqual(100);
    });
  });
});
