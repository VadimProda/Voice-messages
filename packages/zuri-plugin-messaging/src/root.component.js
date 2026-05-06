import React, { useCallback, useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import MessageBoard from "../../ui/src/message-board/MessageBoard";

const API_BASE_URL = "http://localhost:5050";

const createTextBlock = text => ({
  key: Math.random().toString(36).slice(2, 7),
  text,
  type: "unstyled",
  depth: 0,
  inlineStyleRanges: [],
  entityRanges: [],
  data: {}
});

const createEmptyRichText = (text = "") => ({
  blocks: [createTextBlock(text)],
  entityMap: {}
});

const safeJsonParse = (value, fallback = null) => {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
};

const safeSessionJson = (key, fallback = null) => {
  return safeJsonParse(sessionStorage.getItem(key), fallback);
};

const getCurrentUser = () => {
  const sessionUser = safeSessionJson("user", null);

  if (!sessionUser) {
    return {
      id: "guest-user",
      email: "guest@example.com",
      name: "Guest User",
      token: ""
    };
  }

  const fullName = [sessionUser.first_name, sessionUser.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    id: sessionUser.id || sessionUser.email,
    email: sessionUser.email,
    name: fullName || sessionUser.email,
    token: sessionUser.token || sessionStorage.getItem("token") || ""
  };
};

const getWorkspaceId = () => {
  const currentWorkspace = localStorage.getItem("currentWorkspace");

  if (currentWorkspace) {
    return currentWorkspace;
  }

  const urlsTracker = safeJsonParse(localStorage.getItem("urlsTracker"), {
    workspaceIds: []
  });

  const currentShortId = localStorage.getItem("currentWorkspaceShort");

  if (currentShortId && Array.isArray(urlsTracker.workspaceIds)) {
    const matchedWorkspace = urlsTracker.workspaceIds.find(
      workspace => workspace.short_id === currentShortId
    );

    if (matchedWorkspace?.real_id) {
      return matchedWorkspace.real_id;
    }
  }

  return "";
};

const getWorkspaceName = workspaceId => {
  const orgName = localStorage.getItem("orgName");

  if (orgName) {
    return orgName;
  }

  const organizations = safeSessionJson("organisations", []);

  if (Array.isArray(organizations)) {
    const organization = organizations.find(item => item.id === workspaceId);

    if (organization?.name) {
      return organization.name;
    }
  }

  return "Workspace Chat";
};

const getAuthHeaders = (user, extraHeaders = {}) => {
  const token = user?.token || sessionStorage.getItem("token") || "";

  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extraHeaders
  };
};

const parseApiResponse = async response => {
  const text = await response.text();

  let payload = {};

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      payload = {
        message: text
      };
    }
  }

  if (!response.ok) {
    throw new Error(payload.message || `Request failed: ${response.status}`);
  }

  return payload;
};

const apiGet = async (path, user) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers: getAuthHeaders(user)
  });

  return parseApiResponse(response);
};

const apiPostJson = async (path, user, body) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: getAuthHeaders(user, {
      "Content-Type": "application/json"
    }),
    body: JSON.stringify(body)
  });

  return parseApiResponse(response);
};

const apiPostFormData = async (path, user, formData) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: getAuthHeaders(user),
    body: formData
  });

  return parseApiResponse(response);
};

const apiPatchJson = async (path, user, body) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "PATCH",
    headers: getAuthHeaders(user, {
      "Content-Type": "application/json"
    }),
    body: JSON.stringify(body)
  });

  return parseApiResponse(response);
};

const fileToDataUrl = file =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const buildWelcomeMessages = workspaceName => [
  {
    _id: "local-welcome-message",
    message_id: 1,
    sender_id: "system-guide",
    sender: {
      sender_name: "Zuri Guide",
      sender_image_url: ""
    },
    timestamp: Date.now() - 1000 * 60 * 5,
    emojis: [],
    files: [],
    richUiData: createEmptyRichText(
      `Welcome to ${workspaceName}. This local room now saves voice messages through the local backend.`
    ),
    voiceMessage: null
  }
];

const normalizeAttachedFiles = async files => {
  if (!Array.isArray(files) || files.length === 0) {
    return [];
  }

  return Promise.all(
    files.map(async file => ({
      id: `attachment-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      fileName: file.name,
      name: file.name,
      mimeType: file.type,
      type: file.type,
      size: file.size,
      url: await fileToDataUrl(file)
    }))
  );
};

const buildVoiceUploadMetadata = voiceMessage => ({
  duration: voiceMessage.duration || 0,
  fileName:
    voiceMessage.fileName || voiceMessage.file?.name || "voice-message.ogg",
  mimeType: voiceMessage.mimeType || voiceMessage.file?.type || "audio/ogg",
  sizeLabel: voiceMessage.sizeLabel || "",
  waveform: Array.isArray(voiceMessage.waveform) ? voiceMessage.waveform : [],
  transcript: voiceMessage.transcript || "",
  transcriptStatus: voiceMessage.transcriptStatus || "idle"
});

const stripLocalVoiceFields = voiceMessage => {
  const { file, url, src, previewUrl, localUrl, ...safeVoiceMessage } =
    voiceMessage || {};

  return safeVoiceMessage;
};

const uploadVoiceMessage = async (voiceMessage, user) => {
  if (!voiceMessage?.file) {
    return null;
  }

  const metadata = buildVoiceUploadMetadata(voiceMessage);
  const formData = new FormData();

  formData.append("file", voiceMessage.file, metadata.fileName);
  formData.append("metadata", JSON.stringify(metadata));

  const response = await apiPostFormData("/files/voice", user, formData);
  const uploadedVoice = response.data;

  return {
    ...stripLocalVoiceFields(voiceMessage),
    ...uploadedVoice,
    id: uploadedVoice.id || uploadedVoice.fileId,
    fileId: uploadedVoice.fileId || uploadedVoice.id,
    type: "voice",
    fileName: uploadedVoice.fileName || metadata.fileName,
    mimeType: uploadedVoice.mimeType || metadata.mimeType,
    duration: uploadedVoice.duration || metadata.duration,
    sizeLabel: uploadedVoice.sizeLabel || voiceMessage.sizeLabel || "",
    waveform:
      Array.isArray(uploadedVoice.waveform) && uploadedVoice.waveform.length > 0
        ? uploadedVoice.waveform
        : metadata.waveform,
    url: uploadedVoice.url,
    downloadUrl: uploadedVoice.downloadUrl || uploadedVoice.url,
    listened: false,
    listenedBy: [],
    transcript: voiceMessage.transcript || uploadedVoice.transcript || "",
    transcriptStatus:
      voiceMessage.transcriptStatus || uploadedVoice.transcriptStatus || "idle"
  };
};

const isEmptyRichText = richUiData => {
  if (!richUiData?.blocks || !Array.isArray(richUiData.blocks)) {
    return true;
  }

  return richUiData.blocks.every(block => !String(block.text || "").trim());
};

const buildMessagePayload = ({ richUiData, files, voiceMessage }) => ({
  richUiData: richUiData || createEmptyRichText(""),
  files,
  voiceMessage,
  createdAt: new Date().toISOString()
});

const getChannelLabel = channel => {
  if (!channel?.name) {
    return "# all-dms";
  }

  return `# ${channel.name}`;
};

export default function Root() {
  const currentUser = useMemo(() => getCurrentUser(), []);
  const workspaceId = useMemo(() => getWorkspaceId(), []);
  const workspaceName = useMemo(
    () => getWorkspaceName(workspaceId),
    [workspaceId]
  );

  const [messages, setMessages] = useState(() =>
    buildWelcomeMessages(workspaceName)
  );
  const [channel, setChannel] = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [isSavingMessage, setIsSavingMessage] = useState(false);
  const [voicePrivacyEnabled, setVoicePrivacyEnabled] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;

    const loadVoicePreference = async () => {
      if (!currentUser?.email) {
        return;
      }

      try {
        const response = await apiGet(
          `/users/${encodeURIComponent(currentUser.email)}/preferences/voice`,
          currentUser
        );

        if (isActive && typeof response.data?.enabled === "boolean") {
          setVoicePrivacyEnabled(response.data.enabled);
        }
      } catch (requestError) {
        if (isActive) {
          console.warn("Unable to load voice preference:", requestError);
        }
      }
    };

    loadVoicePreference();

    return () => {
      isActive = false;
    };
  }, [currentUser]);

  const loadMessages = useCallback(async () => {
    if (!workspaceId) {
      setError("Workspace is not selected. Go back and choose a workspace.");
      setIsLoadingMessages(false);
      return;
    }

    setIsLoadingMessages(true);
    setError("");

    try {
      const response = await apiGet(
        `/organizations/${workspaceId}/messages`,
        currentUser
      );

      const nextChannel = response.data?.channel || null;
      const nextMessages = Array.isArray(response.data?.messages)
        ? response.data.messages
        : [];

      setChannel(nextChannel);

      if (nextChannel?.id) {
        sessionStorage.setItem("currentRoom", nextChannel.id);
      }

      if (nextChannel?.name) {
        localStorage.setItem("currentRoom", nextChannel.name);
      }

      if (nextMessages.length > 0) {
        setMessages(nextMessages);
      } else {
        setMessages(buildWelcomeMessages(workspaceName));
      }
    } catch (requestError) {
      setError(requestError.message || "Unable to load local messages.");
      setMessages(buildWelcomeMessages(workspaceName));
    } finally {
      setIsLoadingMessages(false);
    }
  }, [currentUser, workspaceId, workspaceName]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const appendMessage = async (richUiData, payload = {}) => {
    const hasText = !isEmptyRichText(richUiData);
    const hasAttachments = Array.isArray(payload.attachments)
      ? payload.attachments.length > 0
      : false;
    const hasVoiceMessage = Boolean(payload.voiceMessage?.file);

    if (!hasText && !hasAttachments && !hasVoiceMessage) {
      return false;
    }

    setIsSavingMessage(true);
    setError("");

    try {
      const files = await normalizeAttachedFiles(payload.attachments || []);
      const voiceMessage = hasVoiceMessage
        ? await uploadVoiceMessage(payload.voiceMessage, currentUser)
        : null;

      const messagePayload = buildMessagePayload({
        richUiData,
        files,
        voiceMessage
      });

      const response = await apiPostJson(
        `/organizations/${workspaceId}/messages`,
        currentUser,
        messagePayload
      );

      const savedMessage = response.data;

      setMessages(prevMessages => {
        const filteredMessages = prevMessages.filter(
          message => message._id !== "local-welcome-message"
        );

        return [...filteredMessages, savedMessage];
      });

      return true;
    } catch (requestError) {
      setError(requestError.message || "Unable to send message.");
      return false;
    } finally {
      setIsSavingMessage(false);
    }
  };

  const handleVoiceMessageListened = async listenedMessage => {
    if (!listenedMessage?._id) {
      return;
    }

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

    try {
      const response = await apiPostJson(
        `/messages/${listenedMessage._id}/listened`,
        currentUser,
        {}
      );

      const updatedMessage = response.data;

      setMessages(prevMessages =>
        prevMessages.map(message =>
          message._id === updatedMessage._id ? updatedMessage : message
        )
      );
    } catch (requestError) {
      console.warn("Unable to persist listened state:", requestError);
    }
  };

  const persistVoicePreference = async enabled => {
    if (!currentUser?.email) {
      setVoicePrivacyEnabled(Boolean(enabled));
      return;
    }

    const response = await apiPatchJson(
      `/users/${encodeURIComponent(currentUser.email)}/preferences/voice`,
      currentUser,
      {
        enabled: Boolean(enabled)
      }
    );

    setVoicePrivacyEnabled(Boolean(response.data?.enabled));
  };

  return (
    <MessagingLayout>
      <MessagingHeader>
        <div>
          <RoomTitle>{getChannelLabel(channel)}</RoomTitle>
        </div>

        <HeaderActions>
          <StatusPill>Local Messaging</StatusPill>

          <RefreshButton type="button" onClick={loadMessages}>
            Refresh
          </RefreshButton>
        </HeaderActions>
      </MessagingHeader>

      {error ? <ErrorBanner>{error}</ErrorBanner> : null}

      <MessageBoard
        currentUserId={currentUser.id}
        down
        height="calc(100vh - 150px)"
        isLoadingMessages={isLoadingMessages}
        isPending={isSavingMessage}
        messages={messages}
        onSendAttachedFile={() => {}}
        onSendMessage={appendMessage}
        onVoiceMessageListened={handleVoiceMessageListened}
        sentMessage={[]}
        setShowEmoji={setShowEmoji}
        showEmoji={showEmoji}
        voiceMessageConfig={{
          enabled: true,
          defaultPrivacyEnabled: voicePrivacyEnabled,
          maxDurationSeconds: 300,
          maxFileSizeMb: 10,
          onPrivacyChange: persistVoicePreference,
          transcriptionEnabled: true,
          transcribe: async payload => {
            await new Promise(resolve => window.setTimeout(resolve, 500));

            return `Local transcript placeholder for ${payload.file.name}`;
          }
        }}
      />
    </MessagingLayout>
  );
}

const MessagingLayout = styled.div`
  height: 100%;
  display: grid;
  grid-template-rows: auto auto 1fr;
  background: radial-gradient(
      circle at top left,
      rgba(0, 184, 124, 0.08),
      transparent 30%
    ),
    linear-gradient(180deg, #fbfdfc 0%, #f2f7f5 100%);
`;

const MessagingHeader = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(39, 82, 60, 0.12);
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(14px);

  @media (max-width: 640px) {
    align-items: flex-start;
    flex-direction: column;
  }
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
`;

const RoomTitle = styled.h1`
  margin: 0;
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

const RefreshButton = styled.button`
  border: 1px solid #cde7da;
  border-radius: 999px;
  padding: 8px 12px;
  background: #fff;
  color: #1b6a46;
  cursor: pointer;
  font-weight: 700;

  &:hover {
    background: #f4fbf7;
  }
`;

const ErrorBanner = styled.div`
  margin: 12px 20px 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: #fff5f5;
  color: #b42318;
  border: 1px solid #ffd4d4;
  font-weight: 600;
`;
