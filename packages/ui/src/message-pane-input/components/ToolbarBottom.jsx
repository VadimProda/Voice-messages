import { useState, useRef, useEffect } from "react";
import { EditorState } from "draft-js";
import RealUnstyledButton from "~/shared/button/Button";
import styled from "styled-components";
import {
  AtSign,
  Border,
  Clip,
  Computer,
  Google,
  Send
} from "@assets/index";
import {
  GlobalStyleForEmojiSelect,
  StyledEmojiSelectWrapper
} from "../EmojiStyles.styled";
import ClickAwayListener from "react-click-away-listener";
import {
  FiMic,
  FiMicOff,
  FiShield,
  FiShieldOff,
  FiSquare
} from "react-icons/fi";

import sendfile from "./SendFile.module.css";

const BorderIcon = () => <img src={Border} alt="" />;
const ClipIcon = () => <img src={Clip} alt="" />;
const SendIcon = () => <img src={Send} alt="send icon" />;
const AtIcon = () => <img src={AtSign} alt="" />;
const ToolbarBottom = props => {
  const {
    editorState,
    setEditorState,
    emojiSelect,
    sendMessageHandler,
    clearAttached
  } = props;
  const [attachedFile, setAttachedFile] = useState(null);
  const [inputKey, setInputKey] = useState("any-key-press");
  const [showAttachInputBox, setshowAttachInputBox] = useState(false);

  //Attachment ref
  // File ref
  const fileRef = useRef();

  useEffect(() => {
    window.addEventListener("keydown", function (e) {
      if (e.ctrlKey && e.key === "u") {
        e.preventDefault();
        fileRef.current.click();
      }
    });
  }, []);

  //Handles sending of attachedfile
  const handleAttachMedia = e => {
    e.preventDefault();
    //Post request is sent here
    sendMessageHandler(attachedFile);

    //Then this is to clear the file from the state
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

  const handleClickSendMessage = e => {
    sendMessageHandler(editorState.getCurrentContent());
    setEditorState(EditorState.createEmpty());
    clearAttached();
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
                    style={{
                      display: "none"
                    }}
                    onChange={handleSelectMedia}
                    multiple
                    key={inputKey || ""}
                    type="file"
                    ref={fileRef}
                    accept="image/*"
                    //onClick={handleAttachMedia}
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
            onClick={() => setshowAttachInputBox(true)}
          >
            <ClipIcon />
          </UnstyledButton>
          {props.voiceMessageEnabled ? (
            <VoiceActionButton
              type="button"
              aria-label={
                props.voicePrivacyEnabled
                  ? props.isRecording
                    ? "Stop recording"
                    : "Record voice message"
                  : "Voice recording disabled"
              }
              title={
                props.voicePrivacyEnabled
                  ? props.isRecording
                    ? "Stop recording"
                    : "Record voice message (Ctrl+Shift+R)"
                  : "Voice recording disabled"
              }
              disabled={!props.voicePrivacyEnabled && !props.isRecording}
              onClick={() => {
                if (!props.voicePrivacyEnabled && !props.isRecording) {
                  return;
                }

                if (props.isRecording) {
                  props.onStopVoiceRecording &&
                    props.onStopVoiceRecording({ autoStopped: false });
                  return;
                }

                props.onStartVoiceRecording &&
                  props.onStartVoiceRecording();
              }}
            >
              {props.isRecording ? <FiSquare size={16} /> : <FiMic size={16} />}
            </VoiceActionButton>
          ) : null}
          <UnstyledButton type="button" aria-label="Mention user" title="Mention user">
            <AtIcon />
          </UnstyledButton>
          {
            <StyledEmojiSelectWrapper>
              <GlobalStyleForEmojiSelect />
              {emojiSelect}
            </StyledEmojiSelectWrapper>
          }
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
          {props.isRecording ? (
            <VoiceActionButton
              type="button"
              aria-label="Cancel recording"
              title="Cancel recording"
              onClick={() =>
                props.onCancelVoiceRecording &&
                props.onCancelVoiceRecording()
              }
            >
              <FiMicOff size={16} />
            </VoiceActionButton>
          ) : null}
          <UnstyledButton
            type="button"
            aria-label="Send message"
            title="Send message"
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
  padding-buttom: 40px;
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
  }
`;

const VoiceActionButton = styled.button`
  height: 32px;
  min-width: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  border-radius: 999px;
  border: none;
  background: ${({ disabled }) => (disabled ? "#eef2ef" : "#e4f5ed")};
  color: ${({ disabled }) => (disabled ? "#8ca097" : "#19794f")};
  cursor: ${({ disabled }) => (disabled ? "not-allowed" : "pointer")};
`;

export default ToolbarBottom;
