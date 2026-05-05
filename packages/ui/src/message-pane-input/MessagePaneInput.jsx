import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import PropTypes from "prop-types";
import styled from "styled-components";
import {
  EditorState,
  RichUtils,
  convertToRaw,
  convertFromRaw,
  getDefaultKeyBinding,
  Modifier
} from "draft-js";
import Editor from "@draft-js-plugins/editor";
import createMentionPlugin, {
  defaultSuggestionsFilter
} from "@draft-js-plugins/mention";
import "emoji-mart/css/emoji-mart.css";
import "!style-loader!css-loader!draft-js-emoji-plugin/lib/plugin.css";
import "@draft-js-plugins/mention/lib/plugin.css";
import "!style-loader!css-loader!@draft-js-plugins/emoji/lib/plugin.css";
import "!style-loader!css-loader!@draft-js-plugins/mention/lib/plugin.css";
import { BsFillFileEarmarkFill } from "react-icons/bs";
import { FiRefreshCcw, FiTrash2 } from "react-icons/fi";

import "./message-editor-input.css";
import ToolbarBottom from "./components/ToolbarBottom";
import ToolbarTop from "./components/ToolbarTop";
import mentions from "./mentions.data";

import createEmojiPlugin from "@draft-js-plugins/emoji";
import { theme } from "./EmojiStyles.styled.js";
import VoiceMessagePlayer from "~/shared/voice-message/VoiceMessagePlayer";
import {
  DEFAULT_VOICE_MESSAGE_LIMITS,
  formatAudioTime,
  generateWaveformFromBlob,
  getAudioDurationFromUrl,
  getVoiceExtensionFromMimeType
} from "~/shared/voice-message/voice-message.utils";

const emojiPlugin = createEmojiPlugin({
  useNativeArt: true,
  theme: theme
});
const { EmojiSelect } = emojiPlugin;

const mentionPlugin = createMentionPlugin({ mentionPrefix: "@" });
const { MentionSuggestions } = mentionPlugin;

const DEFAULT_HOTKEY = {
  ctrlKey: true,
  shiftKey: true,
  key: "R"
};

function keyBindingFn(e, editorState) {
  if (e.code === "Enter") {
    if (e.shiftKey || e.nativeEvent.shiftKey) {
      return "newline";
    } else {
      if (
        editorState.getEditorState().getCurrentContent().getPlainText("")
          .length > 0
      ) {
        return "send";
      }
    }
  }
  return getDefaultKeyBinding(e);
}

const removeSelectedBlocksStyle = editorState => {
  const newContentState = RichUtils.tryToRemoveBlockStyle(editorState);
  if (newContentState) {
    return EditorState.push(editorState, newContentState, "change-block-type");
  }
  return editorState;
};

export const getResetEditorState = editorState => {
  const blocks = editorState.getCurrentContent().getBlockMap().toList();
  const updatedSelection = editorState.getSelection().merge({
    anchorKey: blocks.first().get("key"),
    anchorOffset: 0,
    focusKey: blocks.last().get("key"),
    focusOffset: blocks.last().getLength()
  });
  const newContentState = Modifier.removeRange(
    editorState.getCurrentContent(),
    updatedSelection,
    "forward"
  );

  const newState = EditorState.push(
    editorState,
    newContentState,
    "remove-range"
  );
  removeFromSessionStorage();
  return removeSelectedBlocksStyle(newState);
};

const loadFromSessionStorage = () => {
  const editorStateID = "editorState_" + sessionStorage.getItem("currentRoom");
  const sessionData = sessionStorage.getItem(editorStateID);
  if (sessionData) {
    return convertFromRaw(JSON.parse(sessionData));
  }
  return null;
};

const saveToSessionStorage = editorState => {
  const currentRoom = sessionStorage.getItem("currentRoom");
  const editorStateID = "editorState_" + currentRoom;
  if (currentRoom) {
    sessionStorage.setItem(
      editorStateID,
      JSON.stringify(convertToRaw(editorState))
    );
  }
};

const removeFromSessionStorage = () => {
  const editorStateID = "editorState_" + sessionStorage.getItem("currentRoom");
  sessionStorage.removeItem(editorStateID);
};

const buildVoiceConfig = config => ({
  enabled: config?.enabled !== false,
  maxDurationSeconds:
    config?.maxDurationSeconds ||
    DEFAULT_VOICE_MESSAGE_LIMITS.maxDurationSeconds,
  maxFileSizeMb:
    config?.maxFileSizeMb || DEFAULT_VOICE_MESSAGE_LIMITS.maxFileSizeMb,
  transcriptionEnabled: Boolean(config?.transcriptionEnabled),
  transcribe: config?.transcribe,
  hotkey: {
    ...DEFAULT_HOTKEY,
    ...(config?.hotkey || {})
  }
});

const buildAudioSizeLabel = bytes => {
  const mbSize = bytes / (1024 * 1024);
  if (mbSize >= 1) {
    return `${mbSize.toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

const getSupportedRecorderMimeType = () => {
  const mediaRecorder = window.MediaRecorder;

  if (!mediaRecorder || typeof mediaRecorder.isTypeSupported !== "function") {
    return "";
  }

  const candidates = [
    "audio/ogg;codecs=opus",
    "audio/webm;codecs=opus",
    "audio/mp4"
  ];

  return candidates.find(type => mediaRecorder.isTypeSupported(type)) || "";
};

const matchesVoiceHotkey = (event, hotkeyConfig) =>
  event.ctrlKey === Boolean(hotkeyConfig.ctrlKey) &&
  event.shiftKey === Boolean(hotkeyConfig.shiftKey) &&
  event.key.toUpperCase() === String(hotkeyConfig.key || "").toUpperCase();

const MessagePaneInput = ({
  onSendMessage,
  users,
  onAttachFile,
  voiceMessageConfig
}) => {
  const activeVoiceConfig = useMemo(
    () => buildVoiceConfig(voiceMessageConfig),
    [voiceMessageConfig]
  );
  const [editorState, setEditorState] = useState(() => {
    const content = loadFromSessionStorage();
    return content
      ? EditorState.createWithContent(content)
      : EditorState.createEmpty();
  });
  const [suggestions, setSuggestions] = useState(users || mentions);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [sentAttachedFile, setSentAttachedFile] = useState([]);
  const [preview, setPreview] = useState([]);
  const [voicePrivacyEnabled, setVoicePrivacyEnabled] = useState(
    activeVoiceConfig.enabled
  );
  const [voiceState, setVoiceState] = useState({
    status: "idle",
    duration: 0,
    error: "",
    autoStopped: false
  });
  const [voiceDraft, setVoiceDraft] = useState(null);

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const recorderStartedAtRef = useRef(0);
  const recorderTimerRef = useRef(null);
  const voiceUrlRef = useRef(null);
  const stopReasonRef = useRef("manual");

  useEffect(() => {
    const content = loadFromSessionStorage();
    if (content) {
      setEditorState(EditorState.createWithContent(content));
    } else {
      setEditorState(EditorState.createEmpty());
    }
  }, [sessionStorage.getItem("currentRoom")]);

  useEffect(() => {
    setVoicePrivacyEnabled(activeVoiceConfig.enabled);
  }, [activeVoiceConfig.enabled]);

  useEffect(
    () => () => {
      if (recorderTimerRef.current) {
        window.clearInterval(recorderTimerRef.current);
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      if (voiceUrlRef.current) {
        URL.revokeObjectURL(voiceUrlRef.current);
      }
    },
    []
  );

  const clearVoiceTimers = () => {
    if (recorderTimerRef.current) {
      window.clearInterval(recorderTimerRef.current);
      recorderTimerRef.current = null;
    }
  };

  const clearVoiceDraft = useCallback(() => {
    if (voiceUrlRef.current) {
      URL.revokeObjectURL(voiceUrlRef.current);
      voiceUrlRef.current = null;
    }
    setVoiceDraft(null);
  }, []);

  const stopActiveStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  const setVoiceError = useCallback(message => {
    setVoiceState(prevState => ({
      ...prevState,
      status: "error",
      error: message
    }));
  }, []);

  const onOpenChange = useCallback(_open => {
    setSuggestionsOpen(_open);
  }, []);

  const onSearchChange = useCallback(({ value }) => {
    setSuggestions(defaultSuggestionsFilter(value, mentions));
  }, []);

  const editorStates = currentEditorState => {
    setEditorState(currentEditorState);
    saveToSessionStorage(currentEditorState.getCurrentContent());
  };

  const onChange = currentEditorState => {
    editorStates(currentEditorState);
  };

  const clearEditor = () => {
    setEditorState(getResetEditorState(editorState));
  };

  useEffect(() => {
    if (sentAttachedFile.length > 0) {
      setPreview([]);

      sentAttachedFile.forEach((file, index) => {
        const reader = new FileReader();
        const extension = file.name.substring(file.name.lastIndexOf(".") + 1);

        reader.onloadend = () => {
          const fileObject = {
            id: index,
            name: file.name,
            src: reader.result,
            extension: extension
          };
          setPreview(prevState => [...prevState, fileObject]);
        };
        reader.readAsDataURL(file);
      });

      onAttachFile && onAttachFile(sentAttachedFile);
    } else {
      setPreview([]);
    }
  }, [onAttachFile, sentAttachedFile]);

  const transcribeVoiceMessage = useCallback(
    async payload => {
      if (
        !activeVoiceConfig.transcriptionEnabled ||
        typeof activeVoiceConfig.transcribe !== "function"
      ) {
        return;
      }

      setVoiceDraft(prevState =>
        prevState
          ? {
              ...prevState,
              transcriptStatus: "loading"
            }
          : prevState
      );

      try {
        const transcript = await activeVoiceConfig.transcribe(payload);
        setVoiceDraft(prevState =>
          prevState
            ? {
                ...prevState,
                transcript: transcript || "",
                transcriptStatus: transcript ? "done" : "idle"
              }
            : prevState
        );
      } catch (error) {
        setVoiceDraft(prevState =>
          prevState
            ? {
                ...prevState,
                transcriptStatus: "error"
              }
            : prevState
        );
      }
    },
    [activeVoiceConfig]
  );

  const finalizeVoiceRecording = useCallback(
    async blob => {
      if (!blob || blob.size === 0) {
        setVoiceError("Voice recording failed. Please try again.");
        setVoiceState({
          status: "idle",
          duration: 0,
          error: "Voice recording failed. Please try again.",
          autoStopped: false
        });
        return;
      }

      const blobSizeInMb = blob.size / (1024 * 1024);
      if (blobSizeInMb > activeVoiceConfig.maxFileSizeMb) {
        clearVoiceDraft();
        setVoiceError(
          `Voice message must be smaller than ${activeVoiceConfig.maxFileSizeMb} MB.`
        );
        return;
      }

      const mimeType = blob.type || "audio/ogg";
      const extension = getVoiceExtensionFromMimeType(mimeType);
      const objectUrl = URL.createObjectURL(blob);

      if (voiceUrlRef.current) {
        URL.revokeObjectURL(voiceUrlRef.current);
      }
      voiceUrlRef.current = objectUrl;

      const measuredDuration = await getAudioDurationFromUrl(objectUrl);
      const waveform = await generateWaveformFromBlob(blob);
      const duration =
        measuredDuration ||
        Math.min(voiceState.duration, activeVoiceConfig.maxDurationSeconds);
      const fileName = `voice-message-${Date.now()}.${extension}`;
      const file = new File([blob], fileName, { type: mimeType });
      const payload = {
        duration,
        file,
        fileName,
        listened: false,
        mimeType,
        sizeLabel: buildAudioSizeLabel(blob.size),
        transcript: "",
        transcriptStatus: "idle",
        url: objectUrl,
        waveform
      };

      setVoiceDraft(payload);
      setVoiceState(prevState => ({
        ...prevState,
        status: "preview",
        error: ""
      }));

      transcribeVoiceMessage({
        blob,
        duration,
        file,
        mimeType,
        waveform
      });
    },
    [
      activeVoiceConfig.maxDurationSeconds,
      activeVoiceConfig.maxFileSizeMb,
      clearVoiceDraft,
      setVoiceError,
      transcribeVoiceMessage,
      voiceState.duration
    ]
  );

  const stopVoiceRecording = useCallback(
    ({ cancelled = false, autoStopped = false } = {}) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder) {
        return;
      }

      stopReasonRef.current = cancelled
        ? "cancelled"
        : autoStopped
        ? "auto"
        : "manual";
      clearVoiceTimers();

      if (recorder.state !== "inactive") {
        recorder.stop();
      } else {
        stopActiveStream();
      }
    },
    [stopActiveStream]
  );

  const cancelVoiceRecording = useCallback(() => {
    stopVoiceRecording({ cancelled: true });
  }, [stopVoiceRecording]);

  const startVoiceRecording = useCallback(async () => {
    if (
      !voicePrivacyEnabled ||
      !activeVoiceConfig.enabled ||
      typeof window === "undefined"
    ) {
      return;
    }

    if (
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function" ||
      typeof window.MediaRecorder === "undefined"
    ) {
      setVoiceError("Voice recording is not supported in this browser.");
      return;
    }

    clearVoiceDraft();
    setVoiceState({
      status: "requesting",
      duration: 0,
      error: "",
      autoStopped: false
    });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedRecorderMimeType();
      const mediaRecorder = new window.MediaRecorder(
        stream,
        mimeType
          ? {
              audioBitsPerSecond: 64000,
              mimeType
            }
          : {
              audioBitsPerSecond: 64000
            }
      );

      streamRef.current = stream;
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      stopReasonRef.current = "manual";

      mediaRecorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onerror = () => {
        clearVoiceTimers();
        stopActiveStream();
        setVoiceError("Microphone access was interrupted. Please try again.");
      };

      mediaRecorder.onstop = async () => {
        const reason = stopReasonRef.current;
        const blob = new Blob(chunksRef.current, {
          type: mediaRecorder.mimeType || mimeType || "audio/ogg"
        });

        clearVoiceTimers();
        stopActiveStream();
        chunksRef.current = [];
        mediaRecorderRef.current = null;

        if (reason === "cancelled") {
          clearVoiceDraft();
          setVoiceState({
            status: "idle",
            duration: 0,
            error: "",
            autoStopped: false
          });
          return;
        }

        setVoiceState(prevState => ({
          ...prevState,
          status: "processing",
          autoStopped: reason === "auto"
        }));
        await finalizeVoiceRecording(blob);
      };

      mediaRecorder.start();
      recorderStartedAtRef.current = Date.now();
      setVoiceState({
        status: "recording",
        duration: 0,
        error: "",
        autoStopped: false
      });

      recorderTimerRef.current = window.setInterval(() => {
        const elapsedSeconds = Math.min(
          activeVoiceConfig.maxDurationSeconds,
          Math.floor((Date.now() - recorderStartedAtRef.current) / 1000)
        );

        setVoiceState(prevState => ({
          ...prevState,
          duration: elapsedSeconds
        }));

        if (elapsedSeconds >= activeVoiceConfig.maxDurationSeconds) {
          stopVoiceRecording({ autoStopped: true });
        }
      }, 250);
    } catch (error) {
      clearVoiceTimers();
      stopActiveStream();
      setVoiceError(
        "Microphone permission was denied. Enable it in your browser settings and try again."
      );
    }
  }, [
    activeVoiceConfig.enabled,
    activeVoiceConfig.maxDurationSeconds,
    clearVoiceDraft,
    finalizeVoiceRecording,
    setVoiceError,
    stopActiveStream,
    stopVoiceRecording,
    voicePrivacyEnabled
  ]);

  useEffect(() => {
    if (!activeVoiceConfig.enabled || typeof window === "undefined") {
      return undefined;
    }

    const handleVoiceHotkey = event => {
      if (!matchesVoiceHotkey(event, activeVoiceConfig.hotkey)) {
        return;
      }

      event.preventDefault();

      if (!voicePrivacyEnabled) {
        return;
      }

      if (voiceState.status === "recording") {
        stopVoiceRecording({ autoStopped: false });
        return;
      }

      if (voiceState.status !== "requesting") {
        startVoiceRecording();
      }
    };

    window.addEventListener("keydown", handleVoiceHotkey);
    return () => window.removeEventListener("keydown", handleVoiceHotkey);
  }, [
    activeVoiceConfig.enabled,
    activeVoiceConfig.hotkey,
    startVoiceRecording,
    stopVoiceRecording,
    voicePrivacyEnabled,
    voiceState.status
  ]);

  const sendMessage = contentState => {
    const hasText =
      contentState.hasText() && contentState.getPlainText().trim().length > 0;
    const hasAttachedFiles = sentAttachedFile.length > 0;
    const hasVoiceMessage = Boolean(voiceDraft && voiceDraft.file);

    if (!hasText && !hasAttachedFiles && !hasVoiceMessage) {
      return;
    }

    const payload = {
      attachments: sentAttachedFile,
      voiceMessage: hasVoiceMessage ? voiceDraft : null
    };

    if (hasVoiceMessage && onAttachFile) {
      onAttachFile([voiceDraft.file], {
        source: "voice-message",
        voiceMessage: voiceDraft
      });
    }

    onSendMessage && onSendMessage(convertToRaw(contentState), payload);
    clearEditor();
    setSentAttachedFile([]);
    setPreview([]);
    clearVoiceDraft();
    setVoiceState({
      status: "idle",
      duration: 0,
      error: "",
      autoStopped: false
    });
  };

  const handleKeyCommand = (command, currentEditorState) => {
    const newState = RichUtils.handleKeyCommand(currentEditorState, command);
    if (!newState) {
      if (command === "newline") {
        const newEditorState = RichUtils.insertSoftNewline(currentEditorState);
        if (newEditorState !== currentEditorState) {
          onChange(newEditorState);
        }
        return "handled";
      }
      if (command === "send") {
        sendMessage(currentEditorState.getCurrentContent());
        return "handled";
      }
    }

    if (newState) {
      setEditorState(newState);
      return "handled";
    }
    return "not handled";
  };

  const clearAttached = file => {
    if (file) {
      setSentAttachedFile(prevState =>
        prevState.filter((_, index) => index !== file.id)
      );
    } else {
      setSentAttachedFile([]);
      setPreview([]);
    }
  };

  const handleToggleVoicePrivacy = nextValue => {
    setVoicePrivacyEnabled(nextValue);

    if (!nextValue) {
      if (voiceState.status === "recording") {
        stopVoiceRecording({ cancelled: true });
      }

      clearVoiceDraft();
      setVoiceState({
        status: "idle",
        duration: 0,
        error: "",
        autoStopped: false
      });
    }
  };

  const AudioFilePreview = ({ source }) => {
    return <audio controls src={source} />;
  };

  const DocumentFilePreview = ({ fileName, extension }) => {
    return (
      <StyledDocumentPreview>
        <div>
          <BsFillFileEarmarkFill style={{ width: "42px", height: "42px" }} />
        </div>
        <div style={{ width: "85%" }}>
          <h6>{fileName}</h6>
          <p>{extension}</p>
        </div>
      </StyledDocumentPreview>
    );
  };

  const PreviewFile = ({ file }) => {
    if (file?.src.includes("data:image")) {
      return <img src={file?.src} alt="Image Preview" />;
    } else if (file?.src.includes("data:audio")) {
      return <AudioFilePreview source={file?.src} />;
    } else if (file?.src.includes("data:video")) {
      return <video autoPlay muted src={file?.src} />;
    } else {
      return (
        <DocumentFilePreview
          fileName={file?.name}
          extension={file?.extension}
        />
      );
    }
  };

  function attachedFileHandler(file) {
    let nextFiles = [];

    if (Array.isArray(file)) {
      nextFiles = file;
    } else if (file instanceof File) {
      nextFiles = [file];
    } else if (file) {
      nextFiles = Array.from(file);
    }

    if (nextFiles.length === 0) {
      return;
    }

    setSentAttachedFile(prevState => [...prevState, ...nextFiles]);
  }

  const PreviewItem = () => {
    return (
      <div className="previewContainer">
        {preview?.map(file => {
          return (
            <Preview key={file.id}>
              <PreviewFile file={file} />
              <button onClick={() => clearAttached(file)}>X</button>
            </Preview>
          );
        })}
      </div>
    );
  };

  const isRecording = voiceState.status === "recording";
  const showVoiceNotice =
    isRecording ||
    voiceState.status === "requesting" ||
    voiceState.status === "processing" ||
    voiceState.status === "error" ||
    Boolean(voiceDraft);

  return (
    <Wrapper>
      <InputWrapper>
        <div className="RichEditor-root">
          <ToolbarTop
            editorState={editorState}
            setEditorState={setEditorState}
            emojiSelect={<EmojiSelect />}
            sendMessageHandler={sendMessage}
            sentAttachedFile={file => attachedFileHandler(file)}
          />
          <Editor
            editorState={editorState}
            onChange={onChange}
            handleKeyCommand={handleKeyCommand}
            keyBindingFn={keyBindingFn}
            plugins={[emojiPlugin, mentionPlugin]}
          />
        </div>

        {showVoiceNotice ? (
          <VoiceMessageCard>
            {isRecording ? (
              <>
                <VoiceStatusRow>
                  <VoiceStatusPill>Recording</VoiceStatusPill>
                  <span>{formatAudioTime(voiceState.duration)}</span>
                  <span>
                    Max {formatAudioTime(activeVoiceConfig.maxDurationSeconds)}
                  </span>
                </VoiceStatusRow>
                <VoiceHint>
                  Recording from your microphone. Press `Ctrl+Shift+R` or tap
                  the microphone again to stop.
                </VoiceHint>
              </>
            ) : null}

            {voiceState.status === "requesting" ? (
              <VoiceHint>Waiting for microphone permission...</VoiceHint>
            ) : null}

            {voiceState.status === "processing" ? (
              <VoiceHint>Preparing your voice message preview...</VoiceHint>
            ) : null}

            {voiceState.status === "error" ? (
              <VoiceError>{voiceState.error}</VoiceError>
            ) : null}

            {voiceDraft ? (
              <>
                {voiceState.autoStopped ? (
                  <VoiceHint>
                    Recording stopped automatically after reaching the 5 minute
                    limit.
                  </VoiceHint>
                ) : null}
                <VoiceMessagePlayer compact voiceMessage={voiceDraft} />
                <VoiceActions>
                  <SecondaryButton
                    type="button"
                    onClick={() => {
                      clearVoiceDraft();
                      setVoiceState({
                        status: "idle",
                        duration: 0,
                        error: "",
                        autoStopped: false
                      });
                    }}
                  >
                    <FiTrash2 size={16} />
                    Delete
                  </SecondaryButton>
                  {voicePrivacyEnabled ? (
                    <SecondaryButton
                      type="button"
                      onClick={async () => {
                        clearVoiceDraft();
                        setVoiceState({
                          status: "idle",
                          duration: 0,
                          error: "",
                          autoStopped: false
                        });
                        await startVoiceRecording();
                      }}
                    >
                      <FiRefreshCcw size={16} />
                      Re-record
                    </SecondaryButton>
                  ) : null}
                </VoiceActions>
              </>
            ) : null}
          </VoiceMessageCard>
        ) : null}

        {preview?.length > 0 ? <PreviewItem /> : null}
        <ToolbarBottom
          clearAttached={clearAttached}
          editorState={editorState}
          emojiSelect={<EmojiSelect />}
          isRecording={isRecording}
          onCancelVoiceRecording={cancelVoiceRecording}
          onStartVoiceRecording={startVoiceRecording}
          onStopVoiceRecording={stopVoiceRecording}
          onToggleVoicePrivacy={handleToggleVoicePrivacy}
          sendMessageHandler={sendMessage}
          sentAttachedFile={file => attachedFileHandler(file)}
          setEditorState={setEditorState}
          voiceMessageEnabled={activeVoiceConfig.enabled}
          voicePrivacyEnabled={voicePrivacyEnabled}
        />
        <MentionSuggestions
          open={suggestionsOpen}
          onOpenChange={onOpenChange}
          onSearchChange={onSearchChange}
          suggestions={suggestions}
        />
      </InputWrapper>
    </Wrapper>
  );
};

MessagePaneInput.propTypes = {
  onAttachFile: PropTypes.func,
  onSendMessage: PropTypes.func,
  users: PropTypes.array,
  voiceMessageConfig: PropTypes.shape({
    enabled: PropTypes.bool,
    hotkey: PropTypes.shape({
      ctrlKey: PropTypes.bool,
      key: PropTypes.string,
      shiftKey: PropTypes.bool
    }),
    maxDurationSeconds: PropTypes.number,
    maxFileSizeMb: PropTypes.number,
    transcribe: PropTypes.func,
    transcriptionEnabled: PropTypes.bool
  })
};

export default MessagePaneInput;

const Wrapper = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  background-color: white;
  width: 100%;

  .previewContainer {
    display: flex;
    align-items: center;
    overflow-x: auto;
    gap: 12px;
    padding-bottom: 4px;
  }
`;

const InputWrapper = styled.section`
  border: 1px solid #b0afb0;
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #fff;

  .RichEditor-root {
    border: none;
    padding: 0;
  }

  .RichEditor-editor {
    margin-top: 12px;
  }

  .RichEditor-editor .public-DraftEditor-content {
    min-height: 72px;
  }

  @media (max-width: 640px) {
    padding: 12px;
    gap: 10px;
  }
`;

const Preview = styled.div`
  position: relative;
  margin-top: 14px;
  margin-right: 14px;

  img,
  video,
  audio {
    max-width: 220px;
    border-radius: 12px;
  }

  button {
    position: absolute;
    top: 8px;
    right: 8px;
    border: none;
    background: rgba(11, 22, 16, 0.72);
    color: #fff;
    width: 28px;
    height: 28px;
    border-radius: 999px;
    cursor: pointer;
  }
`;

const StyledDocumentPreview = styled.div`
  max-width: 300px;
  display: flex;
  align-items: center;
  padding: 16px 14px;
  background: #ddd;
  border-radius: 10px;

  h6 {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 20px;
    font-weight: bold;
  }

  p {
    margin: 0;
    text-transform: uppercase;
  }
`;

const VoiceMessageCard = styled.div`
  margin-top: 14px;
  padding: 14px;
  border-radius: 16px;
  background: linear-gradient(180deg, #f8fffb 0%, #eef8f3 100%);
  border: 1px solid #d8efe4;
  display: grid;
  gap: 12px;
`;

const VoiceStatusRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  color: #335647;
  font-size: 0.9rem;
`;

const VoiceStatusPill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 999px;
  background: rgba(194, 42, 80, 0.12);
  color: #b51649;
  padding: 6px 10px;
  font-weight: 700;

  &::before {
    content: "";
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: #d21b56;
    animation: pulse 1.2s ease infinite;
  }

  @keyframes pulse {
    0% {
      transform: scale(0.8);
      opacity: 0.55;
    }
    50% {
      transform: scale(1.1);
      opacity: 1;
    }
    100% {
      transform: scale(0.8);
      opacity: 0.55;
    }
  }
`;

const VoiceHint = styled.p`
  margin: 0;
  color: #47685a;
  font-size: 0.92rem;
`;

const VoiceError = styled.p`
  margin: 0;
  color: #b42318;
  font-size: 0.92rem;
  font-weight: 600;
`;

const VoiceActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
`;

const SecondaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #c6dfd2;
  background: #fff;
  color: #1f6d49;
  border-radius: 999px;
  padding: 8px 12px;
  cursor: pointer;
  font-weight: 600;
`;
