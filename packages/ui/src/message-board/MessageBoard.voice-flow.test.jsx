import React, { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import MessageBoard from "./MessageBoard";

jest.mock("~/message-pane-input/components/ToolbarTop", () => () => (
  <div data-testid="toolbar-top">toolbar-top</div>
));

jest.mock("@draft-js-plugins/editor", () => props => (
  <div data-testid="draft-editor" onClick={() => props.onChange(props.editorState)} />
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
      EmojiSelect: () => React.createElement("button", { type: "button" }, "emoji")
    })
  };
});

jest.mock("~/shared/voice-message/voice-message.utils", () => {
  const actual = jest.requireActual("~/shared/voice-message/voice-message.utils");

  return {
    ...actual,
    generateWaveformFromBlob: jest.fn(async () => [22, 44, 66, 30]),
    getAudioDurationFromUrl: jest.fn(async () => 11)
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
    this.onstop = null;
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable &&
      this.ondataavailable({
        data: new Blob(["voice-note"], { type: this.mimeType })
      });
    this.onstop && this.onstop();
  }
}

function VoiceBoardHarness() {
  const [messages, setMessages] = useState([]);

  return (
    <MessageBoard
      currentUserId="current-user"
      down
      height="500px"
      isLoadingMessages={false}
      isPending={false}
      messages={messages}
      onSendAttachedFile={jest.fn()}
      onSendMessage={(_richUiData, payload = {}) => {
        setMessages(prevState => [
          ...prevState,
          {
            _id: `message-${prevState.length + 1}`,
            emojis: [],
            message_id: prevState.length + 1,
            richUiData: _richUiData,
            sender: {
              sender_image_url: "",
              sender_name: "Current User"
            },
            sender_id: "current-user",
            timestamp: Date.now(),
            voiceMessage: payload.voiceMessage
          }
        ]);
        return true;
      }}
      onVoiceMessageListened={message =>
        setMessages(prevState =>
          prevState.map(currentMessage =>
            currentMessage._id === message._id
              ? {
                  ...currentMessage,
                  voiceMessage: {
                    ...currentMessage.voiceMessage,
                    listened: true
                  }
                }
              : currentMessage
          )
        )
      }
      sentMessage={[]}
      setShowEmoji={jest.fn()}
      showEmoji={false}
      voiceMessageConfig={{ enabled: true }}
    />
  );
}

describe("MessageBoard voice-message flow", () => {
  const originalGetUserMedia = navigator.mediaDevices?.getUserMedia;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  const originalMediaRecorder = window.MediaRecorder;

  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem("currentRoom", "board-room");
    navigator.mediaDevices = {
      getUserMedia: jest.fn(async () => ({
        getTracks: () => [{ stop: jest.fn() }]
      }))
    };
    URL.createObjectURL = jest.fn(() => "blob:voice-message");
    URL.revokeObjectURL = jest.fn();
    window.MediaRecorder = MockMediaRecorder;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: jest.fn().mockResolvedValue()
    });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", {
      configurable: true,
      value: jest.fn()
    });
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

  test("sends a recorded voice message and marks it listened after playback", async () => {
    render(<VoiceBoardHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Record voice message" }));
    await waitFor(() => expect(screen.getByText("Recording")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Stop recording" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Play voice message" })).toBeInTheDocument();
      expect(screen.getByText("New voice message")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Play voice message" }));

    await waitFor(() => {
      expect(screen.getByText("Listened")).toBeInTheDocument();
    });
  });
});
