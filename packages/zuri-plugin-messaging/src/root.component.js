import React, { useEffect, useMemo, useState } from "react";
import styled from "styled-components";

import MessageBoard from "../../ui/src/message-board/MessageBoard";

const STORAGE_KEY_PREFIX = "codex-local-messaging";

const fileToDataUrl = file =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const getCurrentUser = () => {
  const sessionUser = JSON.parse(sessionStorage.getItem("user") || "null");
  if (!sessionUser) {
    return {
      id: "guest-user",
      email: "guest@example.com",
      name: "Guest User"
    };
  }

  const fullName = [sessionUser.first_name, sessionUser.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    id: sessionUser.id || sessionUser.email,
    email: sessionUser.email,
    name: fullName || sessionUser.email
  };
};

const getWorkspaceId = () =>
  localStorage.getItem("currentWorkspace") || "local-workspace";

const getStorageKey = workspaceId => `${STORAGE_KEY_PREFIX}:${workspaceId}`;

const createWelcomeMessages = workspaceName => [
  {
    _id: "welcome-message",
    message_id: 1,
    sender_id: "system-guide",
    sender: {
      sender_name: "Zuri Guide",
      sender_image_url: ""
    },
    timestamp: Date.now() - 1000 * 60 * 15,
    emojis: [],
    richUiData: {
      blocks: [
        {
          data: {},
          depth: 0,
          entityRanges: [],
          inlineStyleRanges: [],
          key: "welcome",
          text: `Welcome to ${workspaceName}. This local messaging room is wired for text and voice-message testing.`,
          type: "unstyled"
        }
      ],
      entityMap: {}
    }
  },
  {
    _id: "voice-sample",
    message_id: 2,
    sender_id: "system-guide",
    sender: {
      sender_name: "Zuri Guide",
      sender_image_url: ""
    },
    timestamp: Date.now() - 1000 * 60 * 5,
    emojis: [],
    richUiData: {
      blocks: [
        {
          data: {},
          depth: 0,
          entityRanges: [],
          inlineStyleRanges: [],
          key: "voice",
          text: "Use the microphone button below to record a local voice message and play it back here.",
          type: "unstyled"
        }
      ],
      entityMap: {}
    },
    voiceMessage: {
      duration: 78,
      fileName: "daily-standup.ogg",
      listened: false,
      sizeLabel: "1.3 MB",
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
      waveform: [
        18, 22, 40, 58, 44, 26, 18, 34, 52, 64, 48, 36, 22, 18, 26, 40, 58,
        46, 30, 22, 18, 30, 46, 58, 42, 24, 18, 20, 34, 50, 62, 44
      ]
    }
  }
];

const loadMessages = workspaceId => {
  const workspaceName = localStorage.getItem("orgName") || "your workspace";
  const savedMessages = localStorage.getItem(getStorageKey(workspaceId));
  if (!savedMessages) {
    return createWelcomeMessages(workspaceName);
  }

  try {
    return JSON.parse(savedMessages);
  } catch (_error) {
    return createWelcomeMessages(workspaceName);
  }
};

export default function Root() {
  const currentUser = useMemo(() => getCurrentUser(), []);
  const workspaceId = useMemo(() => getWorkspaceId(), []);
  const workspaceName = useMemo(
    () => localStorage.getItem("orgName") || "Workspace Chat",
    []
  );
  const [messages, setMessages] = useState(() => loadMessages(workspaceId));
  const [showEmoji, setShowEmoji] = useState(false);
  const [isSavingMessage, setIsSavingMessage] = useState(false);

  useEffect(() => {
    localStorage.setItem(getStorageKey(workspaceId), JSON.stringify(messages));
  }, [messages, workspaceId]);

  const appendMessage = async (richUiData, payload = {}) => {
    setIsSavingMessage(true);

    const files = await Promise.all(
      (payload.attachments || []).map(async file => ({
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        url: await fileToDataUrl(file)
      }))
    );

    let voiceMessage = null;
    if (payload.voiceMessage) {
      voiceMessage = {
        ...payload.voiceMessage,
        listened: false,
        url: await fileToDataUrl(payload.voiceMessage.file)
      };
    }

    const nextMessage = {
      _id: `message-${Date.now()}`,
      message_id: Date.now(),
      sender_id: currentUser.id,
      sender: {
        sender_name: currentUser.name,
        sender_image_url: ""
      },
      timestamp: Date.now(),
      emojis: [],
      files,
      richUiData,
      voiceMessage
    };

    setMessages(prevMessages => [...prevMessages, nextMessage]);
    setIsSavingMessage(false);
    return true;
  };

  const handleVoiceMessageListened = listenedMessage => {
    setMessages(prevMessages =>
      prevMessages.map(message =>
        message._id === listenedMessage._id && message.voiceMessage
          ? {
              ...message,
              voiceMessage: {
                ...message.voiceMessage,
                listened: true
              }
            }
          : message
      )
    );
  };

  return React.createElement(
    MessagingLayout,
    null,
    React.createElement(
      MessagingHeader,
      null,
      React.createElement(
        "div",
        null,
        React.createElement(WorkspaceName, null, workspaceName),
        React.createElement(RoomTitle, null, "# all-dms")
      ),
      React.createElement(StatusPill, null, "Local Messaging")
    ),
    React.createElement(MessageBoard, {
      currentUserId: currentUser.id,
      down: true,
      height: "calc(100vh - 150px)",
      isLoadingMessages: false,
      isPending: isSavingMessage,
      messages,
      onSendAttachedFile: () => {},
      onSendMessage: appendMessage,
      onVoiceMessageListened: handleVoiceMessageListened,
      sentMessage: [],
      setShowEmoji,
      showEmoji,
      voiceMessageConfig: {
        enabled: true,
        transcriptionEnabled: true,
        transcribe: async payload => {
          await new Promise(resolve => window.setTimeout(resolve, 800));
          return `Transcript preview for ${payload.file.name}`;
        }
      }
    })
  );
}

const MessagingLayout = styled.div`
  height: 100%;
  display: grid;
  grid-template-rows: auto 1fr;
  background:
    radial-gradient(circle at top left, rgba(0, 184, 124, 0.08), transparent 30%),
    linear-gradient(180deg, #fbfdfc 0%, #f2f7f5 100%);
`;

const MessagingHeader = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(39, 82, 60, 0.12);
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(14px);
`;

const WorkspaceName = styled.p`
  margin: 0;
  color: #355847;
  font-size: 0.88rem;
`;

const RoomTitle = styled.h1`
  margin: 4px 0 0;
  font-size: 1.4rem;
  color: #183726;
`;

const StatusPill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  background: #e6f8ef;
  color: #1b6a46;
  font-weight: 700;
  font-size: 0.88rem;

  &::before {
    content: "";
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: #00b87c;
  }
`;
