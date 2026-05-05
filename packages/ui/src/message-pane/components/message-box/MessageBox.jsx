import { DateTime } from "luxon";
import RichTextRenderer from "~/rich-text-renderer/RichTextRenderer";
import VoiceMessagePlayer from "~/shared/voice-message/VoiceMessagePlayer";
import {
  isAudioMimeType,
  isAudioUrl
} from "~/shared/voice-message/voice-message.utils";
import styles from "../../message-pane.module.css";

const getVoiceMessageFromMessage = message => {
  if (message?.voiceMessage && message.voiceMessage.url) {
    return message.voiceMessage;
  }

  const voiceFile = (message?.files || []).find(file => {
    if (typeof file === "string") {
      return isAudioUrl(file);
    }

    if (!file) {
      return false;
    }

    return (
      file.type === "voice" ||
      isAudioMimeType(file.mimeType || file.type || "") ||
      isAudioUrl(file.url || file.src || "")
    );
  });

  if (!voiceFile) {
    return null;
  }

  if (typeof voiceFile === "string") {
    return {
      fileName: "voice-message",
      url: voiceFile
    };
  }

  return {
    ...voiceFile,
    url: voiceFile.url || voiceFile.src || voiceFile.downloadUrl || ""
  };
};

export default function MessageBox({ message, onVoiceMessageListened }) {
  const isImage = url => {
    const allowedExtensions = /(\.jpg|\.jpeg|\.png|\.gif)$/i;
    return allowedExtensions.exec(url);
  };
  const voiceMessage = getVoiceMessageFromMessage(message);
  const renderableFiles = (message?.files || []).filter(file => {
    if (typeof file === "string") {
      return !isAudioUrl(file);
    }

    if (!file) {
      return false;
    }

    return !(
      file.type === "voice" ||
      isAudioMimeType(file.mimeType || file.type || "") ||
      isAudioUrl(file.url || file.src || "")
    );
  });

  return (
    <div className="msg-container">
      <div className="img__wrapper">
        <img
          src={
            message.sender.sender_image_url ||
            `https://i.pravatar.cc/300?u=${message.sender_id}`
          }
          alt="user-avatar"
          className="user-avatar"
        />
      </div>
      {message.event?.action === "join:channel" ? (
        <span className="name">
          <span style={{ fontStyle: "italic", color: "grey" }}>
            {" "}
            {message.username} joined the channel{" "}
          </span>
        </span>
      ) : (
        <div className="msgParticulars">
          <div className="name-time">
            <span className="name">
              <strong> {message.sender.sender_name} </strong>
            </span>
            <span className="time">
              {DateTime.fromMillis(message.timestamp).toFormat("T a")}
            </span>
          </div>
          <div className="message">
            {message.richUiData &&
              Object.keys(message.richUiData).length !== 0 && (
              <RichTextRenderer richUiMessageConfig={message.richUiData} />
            )}
          </div>
          {voiceMessage ? (
            <div className={styles.voiceMessageWrapper}>
              <VoiceMessagePlayer
                voiceMessage={voiceMessage}
                onListened={() =>
                  onVoiceMessageListened &&
                  onVoiceMessageListened(message, voiceMessage)
                }
              />
            </div>
          ) : null}
          <div className={styles.fileWrapper}>
            {renderableFiles.map((file, index) => {
              const fileUrl =
                typeof file === "string" ? file : file.url || file.src || "";

              return (
                <div key={index}>
                  {isImage(fileUrl) && <img src={fileUrl} className={styles.file} />}
                  {!isImage(fileUrl) && <embed src={fileUrl} className={styles.file} />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
