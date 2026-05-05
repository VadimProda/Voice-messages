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
  const originalFileReader = global.FileReader;

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
  });

  afterEach(() => {
    global.FileReader = originalFileReader;
    latestMessageBoardProps = null;
    jest.clearAllMocks();
  });

  test("loads sample data, appends voice messages and updates listened status", async () => {
    render(<Root />);

    expect(screen.getByTestId("message-count")).toHaveTextContent("2");
    expect(latestMessageBoardProps.voiceMessageConfig.enabled).toBe(true);
    expect(latestMessageBoardProps.messages[1].voiceMessage.listened).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Append voice message" }));

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

    fireEvent.click(screen.getByRole("button", { name: "Mark sample listened" }));

    await waitFor(() => {
      expect(screen.getByTestId("sample-listened")).toHaveTextContent("true");
    });
  });
});
