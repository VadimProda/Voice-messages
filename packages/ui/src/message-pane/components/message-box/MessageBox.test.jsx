import React from "react";
import { render, screen } from "@testing-library/react";

import MessageBox from "./MessageBox";

jest.mock(
  "~/rich-text-renderer/RichTextRenderer",
  () =>
    ({ richUiMessageConfig }) =>
      <div>{richUiMessageConfig?.blocks?.[0]?.text || ""}</div>
);

jest.mock(
  "~/shared/voice-message/VoiceMessagePlayer",
  () =>
    ({ voiceMessage }) =>
      <div data-testid="voice-player">{voiceMessage.fileName}</div>
);

describe("MessageBox", () => {
  test("renders image attachments from data URLs with accessible alt text", () => {
    render(
      <MessageBox
        message={{
          files: [
            {
              fileName: "team-photo.png",
              mimeType: "image/png",
              url: "data:image/png;base64,abc"
            }
          ],
          message_id: 1,
          richUiData: {
            blocks: [{ text: "Attachment", key: "a", type: "unstyled" }],
            entityMap: {}
          },
          sender: {
            sender_name: "Vadim Teams",
            sender_image_url: ""
          },
          sender_id: "user-1",
          timestamp: Date.now()
        }}
      />
    );

    expect(screen.getByAltText("team-photo.png")).toBeInTheDocument();
  });

  test("renders voice player when a voice message is attached", () => {
    render(
      <MessageBox
        message={{
          files: [],
          message_id: 2,
          richUiData: {
            blocks: [{ text: "Voice", key: "b", type: "unstyled" }],
            entityMap: {}
          },
          sender: {
            sender_name: "Vadim Teams",
            sender_image_url: ""
          },
          sender_id: "user-2",
          timestamp: Date.now(),
          voiceMessage: {
            fileName: "daily-standup.ogg",
            url: "https://example.com/daily-standup.ogg"
          }
        }}
      />
    );

    expect(screen.getByTestId("voice-player")).toHaveTextContent(
      "daily-standup.ogg"
    );
  });
});
