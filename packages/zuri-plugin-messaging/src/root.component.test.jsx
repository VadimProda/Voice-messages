import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import Root from "./root.component";

let latestMessageBoardProps = null;

jest.mock("../../ui/src/message-board/MessageBoard", () => props => {
  latestMessageBoardProps = props;

  return (
    <div>
      <div data-testid="message-count">{props.messages.length}</div>
      <div data-testid="sample-listened">
        {String(Boolean(props.messages[1]?.voiceMessage?.listened))}
      </div>
      <div data-testid="voice-privacy-enabled">
        {String(Boolean(props.voiceMessageConfig?.defaultPrivacyEnabled))}
      </div>
      <button
        type="button"
        onClick={async () => {
          await props.onSendMessage(
            {
              blocks: [],
              entityMap: {}
            },
            {
              voiceMessage: {
                duration: 14,
                file: new File(["voice-binary"], "test-voice.ogg", {
                  type: "audio/ogg"
                }),
                fileName: "test-voice.ogg",
                listened: false,
                sizeLabel: "1 KB",
                url: "blob:test-voice",
                waveform: [18, 36, 54]
              }
            }
          );
        }}
      >
        Append voice message
      </button>
      <button
        type="button"
        onClick={() => props.onVoiceMessageListened(props.messages[1])}
      >
        Mark sample listened
      </button>
      <button
        type="button"
        onClick={() => props.voiceMessageConfig.onPrivacyChange(false)}
      >
        Disable privacy
      </button>
    </div>
  );
});

class MockFileReader {
  constructor() {
    this.onload = null;
    this.onerror = null;
    this.result = null;
  }

  readAsDataURL(file) {
    this.result = `data:${file.type};base64,dm9pY2U=`;
    if (this.onload) {
      this.onload({ target: this });
    }
  }
}

describe("local messaging root integration", () => {
  const originalFetch = global.fetch;
  const originalFileReader = global.FileReader;
  const initialMessages = [
    {
      _id: "local-message-1",
      emojis: [],
      message_id: 1,
      richUiData: {
        blocks: [{ key: "a", text: "Welcome", type: "unstyled" }],
        entityMap: {}
      },
      sender: {
        sender_image_url: "",
        sender_name: "Zuri Guide"
      },
      sender_id: "system-guide",
      timestamp: Date.now() - 1000
    },
    {
      _id: "local-message-2",
      emojis: [],
      message_id: 2,
      richUiData: {
        blocks: [{ key: "b", text: "Voice sample", type: "unstyled" }],
        entityMap: {}
      },
      sender: {
        sender_image_url: "",
        sender_name: "Zuri Guide"
      },
      sender_id: "system-guide",
      timestamp: Date.now(),
      voiceMessage: {
        fileName: "sample.ogg",
        listened: false,
        url: "https://example.com/sample.ogg",
        waveform: [18, 36, 54]
      }
    }
  ];

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem(
      "user",
      JSON.stringify({
        email: "local@example.com",
        first_name: "Local",
        id: "local-user",
        last_name: "Tester"
      })
    );
    localStorage.setItem("currentWorkspace", "workspace-1");
    localStorage.setItem("orgName", "Codex Workspace");
    global.FileReader = MockFileReader;
    global.fetch = jest.fn(async (url, options = {}) => {
      if (
        String(url).includes("/users/local%40example.com/preferences/voice") &&
        (!options.method || options.method === "GET")
      ) {
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              data: {
                email: "local@example.com",
                enabled: true
              }
            })
        };
      }

      if (
        String(url).includes("/organizations/workspace-1/messages") &&
        (!options.method || options.method === "GET")
      ) {
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              data: {
                channel: {
                  id: "channel-1",
                  name: "all-dms"
                },
                messages: initialMessages
              }
            })
        };
      }

      if (String(url).includes("/files/voice")) {
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              data: {
                id: "voice-file-1",
                fileId: "voice-file-1",
                fileName: "test-voice.ogg",
                mimeType: "audio/ogg",
                duration: 14,
                sizeLabel: "1 KB",
                url: "data:audio/ogg;base64,dm9pY2U=",
                downloadUrl: "data:audio/ogg;base64,dm9pY2U=",
                waveform: [18, 36, 54]
              }
            })
        };
      }

      if (
        String(url).includes("/organizations/workspace-1/messages") &&
        options.method === "POST"
      ) {
        const body = JSON.parse(options.body);

        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              data: {
                _id: "saved-message-3",
                emojis: [],
                files: body.files,
                message_id: 3,
                richUiData: body.richUiData,
                sender: {
                  sender_image_url: "",
                  sender_name: "Local Tester"
                },
                sender_id: "local-user",
                timestamp: Date.now(),
                voiceMessage: body.voiceMessage
              }
            })
        };
      }

      if (
        String(url).includes("/users/local%40example.com/preferences/voice") &&
        options.method === "PATCH"
      ) {
        const body = JSON.parse(options.body);

        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              data: {
                email: "local@example.com",
                enabled: body.enabled
              }
            })
        };
      }

      if (String(url).includes("/messages/local-message-2/listened")) {
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              data: {
                ...initialMessages[1],
                voiceMessage: {
                  ...initialMessages[1].voiceMessage,
                  listened: true
                }
              }
            })
        };
      }

      return {
        ok: false,
        text: async () =>
          JSON.stringify({ message: `Unhandled request: ${url}` })
      };
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    global.FileReader = originalFileReader;
    latestMessageBoardProps = null;
    jest.clearAllMocks();
  });

  test("loads sample data, appends voice messages and updates listened status", async () => {
    render(<Root />);

    await waitFor(() => {
      expect(screen.getByTestId("message-count")).toHaveTextContent("2");
    });

    expect(latestMessageBoardProps.voiceMessageConfig.enabled).toBe(true);
    expect(screen.getByTestId("voice-privacy-enabled")).toHaveTextContent(
      "true"
    );
    expect(latestMessageBoardProps.messages[1].voiceMessage.listened).toBe(
      false
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Append voice message" })
    );

    await waitFor(() => {
      expect(screen.getByTestId("message-count")).toHaveTextContent("3");
    });

    expect(latestMessageBoardProps.messages[2].voiceMessage).toEqual(
      expect.objectContaining({
        fileName: "test-voice.ogg",
        listened: false,
        url: "data:audio/ogg;base64,dm9pY2U="
      })
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Mark sample listened" })
    );

    await waitFor(() => {
      expect(screen.getByTestId("sample-listened")).toHaveTextContent("true");
    });

    fireEvent.click(screen.getByRole("button", { name: "Disable privacy" }));

    await waitFor(() => {
      expect(screen.getByTestId("voice-privacy-enabled")).toHaveTextContent(
        "false"
      );
    });
  });
});
