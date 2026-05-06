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
  const isImageFile = file => {
    if (typeof file === "string") {
      return (
        /^data:image\//i.test(file) ||
        /(\.jpg|\.jpeg|\.png|\.gif|\.webp)$/i.test(file)
      );
    }

    const fileUrl = file?.url || file?.src || "";
    const mimeType = file?.mimeType || file?.type || "";

    return (
      /^data:image\//i.test(fileUrl) ||
      mimeType.startsWith("image/") ||
      /(\.jpg|\.jpeg|\.png|\.gif|\.webp)$/i.test(fileUrl)
    );
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
                showMeta={false}
                showTranscript={false}
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
                  {isImageFile(file) ? (
                    <img
                      src={fileUrl}
                      alt={
                        typeof file === "string"
                          ? "message attachment"
                          : file.fileName || file.name || "message attachment"
                      }
                      className={styles.file}
                    />
                  ) : (
                    <embed src={fileUrl} className={styles.file} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
