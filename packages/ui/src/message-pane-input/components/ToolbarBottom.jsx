import { useState, useRef, useEffect } from "react";
import RealUnstyledButton from "~/shared/button/Button";
import styled from "styled-components";
import { AtSign, Border, Clip, Computer, Google, Send } from "@assets/index";
import {
  GlobalStyleForEmojiSelect,
  StyledEmojiSelectWrapper
} from "../EmojiStyles.styled";
import ClickAwayListener from "react-click-away-listener";
import { FiMic, FiShield, FiShieldOff } from "react-icons/fi";
import sendfile from "./SendFile.module.css";

const BorderIcon = () => <img src={Border} alt="" />;
const ClipIcon = () => <img src={Clip} alt="" />;
const SendIcon = () => <img src={Send} alt="send icon" />;
const AtIcon = () => <img src={AtSign} alt="" />;

const ToolbarBottom = props => {
  const { editorState, emojiSelect, sendMessageHandler } = props;

  const [attachedFile, setAttachedFile] = useState(null);
  const [inputKey, setInputKey] = useState("any-key-press");
  const [showAttachInputBox, setshowAttachInputBox] = useState(false);

  const fileRef = useRef();

  useEffect(() => {
    const handleAttachHotkey = e => {
      if (e.ctrlKey && e.key === "u") {
        e.preventDefault();

        if (fileRef.current) {
          fileRef.current.click();
        }
      }
    };

    window.addEventListener("keydown", handleAttachHotkey);

    return () => {
      window.removeEventListener("keydown", handleAttachHotkey);
    };
  }, []);

  const handleAttachMedia = async e => {
    e.preventDefault();

    if (props.isSending) {
      return;
    }

    await sendMessageHandler(attachedFile);
    props.sentAttachedFile(null);
  };

  const handleClickAway = () => {
    setshowAttachInputBox(false);
  };

  const handleSelectMedia = e => {
    setAttachedFile(e.target.files);
    props.sentAttachedFile(e.target.files);
    setshowAttachInputBox(false);
  };

  const handleClickSendMessage = async e => {
    e.preventDefault();

    if (props.isSending) {
      return;
    }

    await sendMessageHandler(editorState.getCurrentContent());
  };

  return (
    <ClickAwayListener onClickAway={handleClickAway}>
      <Wrapper>
        {showAttachInputBox ? (
          <AttachFile>
            <div>
              <div className={`${sendfile.container}`}>
                <div className={`${sendfile.flex}`}>
                  <img src={Google} alt="" />
                  <span className={`${sendfile.span}`}>
                    Upload from Google Drive
                  </span>
                </div>
              </div>

              <div className={`${sendfile.container}`}>
                <label className={`${sendfile.flex} ${sendfile.label}`}>
                  <img src={Computer} alt="" onClick={handleSelectMedia} />
                  <span className={`${sendfile.span}`}>
                    Upload from your computer
                  </span>
                  <span className={`${sendfile.ctrl}`}>Ctrl+U</span>

                  <input
                    style={{ display: "none" }}
                    onChange={handleSelectMedia}
                    multiple
                    key={inputKey || ""}
                    type="file"
                    ref={fileRef}
                    accept="image/*"
                  />
                </label>
              </div>
            </div>
          </AttachFile>
        ) : null}

        <FormatContainer>
          <UnstyledButton
            type="button"
            aria-label="Attach file"
            title="Attach file"
            disabled={props.isSending}
            onClick={() => setshowAttachInputBox(true)}
          >
            <ClipIcon />
          </UnstyledButton>

          {props.voiceMessageEnabled && !props.isRecording ? (
            <VoiceActionButton
              type="button"
              aria-label={
                props.voicePrivacyEnabled
                  ? "Record voice message"
                  : "Voice recording disabled"
              }
              title={
                props.voicePrivacyEnabled
                  ? "Record voice message (Ctrl+Shift+R)"
                  : "Voice recording disabled"
              }
              disabled={props.isSending || !props.voicePrivacyEnabled}
              onClick={() => {
                if (props.isSending || !props.voicePrivacyEnabled) {
                  return;
                }

                props.onStartVoiceRecording && props.onStartVoiceRecording();
              }}
            >
              <FiMic size={17} style={{ transform: "translateY(0.25px)" }} />
            </VoiceActionButton>
          ) : null}

          <UnstyledButton
            type="button"
            aria-label="Mention user"
            title="Mention user"
            disabled={props.isSending}
          >
            <AtIcon />
          </UnstyledButton>

          <StyledEmojiSelectWrapper>
            <GlobalStyleForEmojiSelect />
            {emojiSelect}
          </StyledEmojiSelectWrapper>

          <span style={{ paddingInline: "4px" }}>
            <BorderIcon />
          </span>
        </FormatContainer>

        <SendContainer>
          {props.voiceMessageEnabled ? (
            <VoiceActionButton
              type="button"
              aria-label={
                props.voicePrivacyEnabled
                  ? "Disable voice messages"
                  : "Enable voice messages"
              }
              title={
                props.voicePrivacyEnabled
                  ? "Disable voice messages"
                  : "Enable voice messages"
              }
              disabled={props.isSending || props.isRecording}
              onClick={() =>
                props.onToggleVoicePrivacy &&
                props.onToggleVoicePrivacy(!props.voicePrivacyEnabled)
              }
            >
              {props.voicePrivacyEnabled ? (
                <FiShield size={16} />
              ) : (
                <FiShieldOff size={16} />
              )}
            </VoiceActionButton>
          ) : null}

          <UnstyledButton
            type="button"
            aria-label={props.isSending ? "Sending message" : "Send message"}
            title={props.isSending ? "Sending message" : "Send message"}
            disabled={props.isSending || props.isRecording}
            onClick={handleClickSendMessage || handleAttachMedia}
          >
            <SendIcon />
          </UnstyledButton>
        </SendContainer>
      </Wrapper>
    </ClickAwayListener>
  );
};

const Wrapper = styled.div`
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding-top: 12px;
  margin-top: 12px;
  border-top: 1px solid #e4e7e5;
`;

const FormatContainer = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  min-width: 0;
`;

const SendContainer = styled.div`
  margin-left: auto;
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;

  @media (max-width: 640px) {
    width: 100%;
    margin-left: 0;
    justify-content: flex-end;
  }
`;

const AttachFile = styled.div`
  width: 45%;
  border-radius: 8px;
  background-color: #f8f8f8;
  padding-top: 30px;
  padding-bottom: 40px;
  position: absolute;
  right: 55%;
  bottom: 40px;
`;

const UnstyledButton = styled(RealUnstyledButton)`
  height: 32px;
  min-width: 32px;
  display: grid;
  place-items: center;
  padding: 2px 4px;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.58;
  }
`;

const VoiceActionButton = styled.button`
  width: 32px;
  height: 32px;
  min-width: 32px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  line-height: 0;
  border-radius: 50%;
  border: none;
  background: ${({ disabled }) => (disabled ? "#eef2ef" : "#e4f5ed")};
  color: ${({ disabled }) => (disabled ? "#8ca097" : "#19794f")};
  cursor: ${({ disabled }) => (disabled ? "not-allowed" : "pointer")};
  transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;

  svg {
    display: block;
    width: 17px;
    height: 17px;
    flex-shrink: 0;
  }

  &:hover:not(:disabled) {
    background: #d6f0e3;
  }

  &:active:not(:disabled) {
    transform: scale(0.96);
  }

  &:focus-visible {
    outline: 3px solid rgba(25, 121, 79, 0.2);
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.72;
  }

  @media (max-width: 640px) {
    width: 36px;
    height: 36px;
    min-width: 36px;
  }
`;

export default ToolbarBottom;
