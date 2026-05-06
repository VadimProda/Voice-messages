import React from "react";
import { render, screen } from "@testing-library/react";

import MessagePane from "./MessagePane";

jest.mock("./components/hover-items/HoverItems", () => () => (
  <div data-testid="hover-items" />
));

jest.mock("./components/emoji-card/EmojiCard", () => () => (
  <div data-testid="emoji-card" />
));

jest.mock(
  "~/rich-text-renderer/RichTextRenderer",
  () =>
    ({ richUiMessageConfig }) =>
      <div>{richUiMessageConfig?.blocks?.[0]?.text || ""}</div>
);

describe("MessagePane avatar rendering", () => {
  test("renders sender image when available", () => {
    render(
      <MessagePane
        currentUserId="user-1"
        message={{
          _id: "message-1",
          emojis: [],
          message_id: 1,
          richUiData: {
            blocks: [{ text: "Hello", key: "a", type: "unstyled" }],
            entityMap: {}
          },
          sender: {
            sender_image_url: "https://example.com/avatar.png",
            sender_name: "Vadim"
          },
          timestamp: Date.now()
        }}
      />
    );

    expect(screen.getByAltText("Vadim")).toHaveAttribute(
      "src",
      "https://example.com/avatar.png"
    );
  });

  test("renders fallback initial when sender image is missing", () => {
    render(
      <MessagePane
        currentUserId="user-1"
        message={{
          _id: "message-2",
          emojis: [],
          message_id: 2,
          richUiData: {
            blocks: [{ text: "Hello", key: "b", type: "unstyled" }],
            entityMap: {}
          },
          sender: {
            sender_image_url: "",
            sender_name: "Boris"
          },
          timestamp: Date.now()
        }}
      />
    );

    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.queryByAltText("Boris")).not.toBeInTheDocument();
  });
});
