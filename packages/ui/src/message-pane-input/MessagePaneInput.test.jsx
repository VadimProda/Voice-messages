import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import MessagePaneInput from "./MessagePaneInput";

jest.mock("./components/ToolbarTop", () => () => (
  <div data-testid="toolbar-top">toolbar-top</div>
));

jest.mock("@draft-js-plugins/editor", () => props => (
  <div
    data-testid="draft-editor"
    onClick={() => props.onChange(props.editorState)}
  />
));

jest.mock("@draft-js-plugins/mention", () => {
  const React = require("react");

  const factory = () => ({
    MentionSuggestions: () => React.createElement("div", null)
  });

  return {
    __esModule: true,
    default: factory,
    defaultSuggestionsFilter: jest.fn(() => [])
  };
});

jest.mock("@draft-js-plugins/emoji", () => {
  const React = require("react");

  return {
    __esModule: true,
    default: () => ({
      EmojiSelect: () =>
        React.createElement("button", { type: "button" }, "emoji")
    })
  };
});

jest.mock("~/shared/voice-message/voice-message.utils", () => {
  const actual = jest.requireActual(
    "~/shared/voice-message/voice-message.utils"
  );

  return {
    ...actual,
    generateWaveformFromBlob: jest.fn(async () => [24, 48, 72, 36]),
    getAudioDurationFromUrl: jest.fn(async () => 9)
  };
});

class MockMediaRecorder {
  static isTypeSupported() {
    return true;
  }

  constructor(stream, options = {}) {
    this.stream = stream;
    this.mimeType = options.mimeType || "audio/ogg;codecs=opus";
    this.state = "inactive";
    this.ondataavailable = null;
    this.onerror = null;
    this.onstop = null;
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    if (this.ondataavailable) {
      this.ondataavailable({
        data: new Blob(["voice-payload"], { type: this.mimeType })
      });
    }
    if (this.onstop) {
      this.onstop();
    }
  }
}

describe("MessagePaneInput voice flow", () => {
  const originalGetUserMedia = navigator.mediaDevices?.getUserMedia;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  const originalMediaRecorder = window.MediaRecorder;

  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem("currentRoom", "voice-room");
    navigator.mediaDevices = {
      getUserMedia: jest.fn(async () => ({
        getTracks: () => [{ stop: jest.fn() }]
      }))
    };
    URL.createObjectURL = jest.fn(() => "blob:voice-preview");
    URL.revokeObjectURL = jest.fn();
    window.MediaRecorder = MockMediaRecorder;
  });

  afterEach(() => {
    if (originalGetUserMedia) {
      navigator.mediaDevices.getUserMedia = originalGetUserMedia;
    }
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
    window.MediaRecorder = originalMediaRecorder;
    jest.clearAllMocks();
  });

  test("records, previews and sends a voice message", async () => {
    const onSendMessage = jest.fn();
    const onAttachFile = jest.fn();

    render(
      <MessagePaneInput
        onAttachFile={onAttachFile}
        onSendMessage={onSendMessage}
        voiceMessageConfig={{ enabled: true }}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Record voice message" })
    );

    await waitFor(() => {
      expect(screen.getByText("Recording")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Stop voice recording" })
    );

    await waitFor(() => {
      expect(screen.getByText("Delete")).toBeInTheDocument();
      expect(screen.getByText("Re-record")).toBeInTheDocument();
      expect(
        screen.getByText(/voice-message-\d+\.(mp3|ogg)/)
      ).toBeInTheDocument();
      expect(screen.getByText("1 KB")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(onSendMessage).toHaveBeenCalledTimes(1);
    });

    const [, payload] = onSendMessage.mock.calls[0];

    expect(payload.voiceMessage).toEqual(
      expect.objectContaining({
        duration: 9,
        file: expect.any(File),
        fileName: expect.stringMatching(/^voice-message-\d+\.(mp3|ogg)$/),
        listened: false,
        sizeLabel: "1 KB",
        url: "blob:voice-preview",
        waveform: [24, 48, 72, 36]
      })
    );
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });

  test("disables recording when privacy is turned off", async () => {
    const onPrivacyChange = jest.fn(async () => true);

    render(
      <MessagePaneInput
        onSendMessage={jest.fn()}
        voiceMessageConfig={{
          defaultPrivacyEnabled: true,
          enabled: true,
          onPrivacyChange
        }}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Disable voice messages" })
    );

    expect(
      screen.getByRole("button", { name: "Voice recording disabled" })
    ).toBeDisabled();
    await waitFor(() => {
      expect(onPrivacyChange).toHaveBeenCalledWith(false);
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Enable voice messages" })
    );

    expect(
      screen.getByRole("button", { name: "Record voice message" })
    ).toBeEnabled();
    await waitFor(() => {
      expect(onPrivacyChange).toHaveBeenCalledWith(true);
    });
  });

  test("waits for transcription before sending the recorded voice message", async () => {
    let resolveTranscript;
    const onSendMessage = jest.fn();

    render(
      <MessagePaneInput
        onSendMessage={onSendMessage}
        voiceMessageConfig={{
          enabled: true,
          transcriptionEnabled: true,
          transcribe: jest.fn(
            () =>
              new Promise(resolve => {
                resolveTranscript = resolve;
              })
          )
        }}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Record voice message" })
    );

    await waitFor(() => {
      expect(screen.getByText("Recording")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Stop voice recording" })
    );

    await waitFor(() => {
      expect(screen.getByText("Delete")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(onSendMessage).not.toHaveBeenCalled();

    resolveTranscript("Transcript is ready");

    await waitFor(() => {
      expect(onSendMessage).toHaveBeenCalledTimes(1);
    });

    const [, payload] = onSendMessage.mock.calls[0];

    expect(payload.voiceMessage).toEqual(
      expect.objectContaining({
        transcript: "Transcript is ready",
        transcriptStatus: "done"
      })
    );
  });
});
