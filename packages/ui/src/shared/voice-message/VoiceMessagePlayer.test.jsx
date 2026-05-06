import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import VoiceMessagePlayer from "./VoiceMessagePlayer";

describe("VoiceMessagePlayer", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: jest.fn().mockResolvedValue()
    });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", {
      configurable: true,
      value: jest.fn()
    });
  });

  test("renders transcript, file name and loading status", () => {
    render(
      <VoiceMessagePlayer
        voiceMessage={{
          duration: 42,
          fileName: "daily-sync.ogg",
          sizeLabel: "512 KB",
          transcript: "Daily update transcript",
          transcriptStatus: "loading",
          url: "https://example.com/daily-sync.ogg",
          waveform: [16, 32, 48, 64]
        }}
      />
    );

    expect(screen.getByText("daily-sync.ogg")).toBeInTheDocument();
    expect(screen.getByText("512 KB")).toBeInTheDocument();
    expect(screen.getByText("Transcribing...")).toBeInTheDocument();
    expect(screen.getByText("Daily update transcript")).toBeInTheDocument();
  });

  test("can hide metadata and transcript for compact chat history rendering", () => {
    render(
      <VoiceMessagePlayer
        showMeta={false}
        showTranscript={false}
        voiceMessage={{
          duration: 42,
          fileName: "daily-sync.ogg",
          sizeLabel: "512 KB",
          transcript: "Daily update transcript",
          transcriptStatus: "done",
          url: "https://example.com/daily-sync.ogg",
          waveform: [16, 32, 48, 64]
        }}
      />
    );

    expect(screen.queryByText("daily-sync.ogg")).not.toBeInTheDocument();
    expect(screen.queryByText("512 KB")).not.toBeInTheDocument();
    expect(screen.queryByText("Listened")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Daily update transcript")
    ).not.toBeInTheDocument();
  });

  test("cycles playback speed on click", () => {
    render(
      <VoiceMessagePlayer
        voiceMessage={{
          duration: 15,
          fileName: "voice-note.ogg",
          url: "https://example.com/voice-note.ogg",
          waveform: [24, 48, 72]
        }}
      />
    );

    const speedButton = screen.getByRole("button", {
      name: "Playback speed 1x. Click to change."
    });

    fireEvent.click(speedButton);
    expect(
      screen.getByRole("button", {
        name: "Playback speed 1.5x. Click to change."
      })
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Playback speed 1.5x. Click to change."
      })
    );
    expect(
      screen.getByRole("button", {
        name: "Playback speed 2x. Click to change."
      })
    ).toBeInTheDocument();
  });
});
