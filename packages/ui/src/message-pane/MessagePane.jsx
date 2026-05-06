import PropTypes from "prop-types";
import MessageBox from "./components/message-box/MessageBox";
import HoverItems from "./components/hover-items/HoverItems";
import EmojiCard from "./components/emoji-card/EmojiCard";
import styles from "./message-pane.module.css";

const getSenderName = message => {
  if (message?.sender?.sender_name) return message.sender.sender_name;
  if (message?.username) return message.username;
  return "Unknown User";
};

const getSenderImage = message => {
  if (message?.sender?.sender_image_url) return message.sender.sender_image_url;
  if (message?.sender_image_url) return message.sender_image_url;
  return "";
};

const getInitial = name => {
  return (
    String(name || "?")
      .trim()
      .charAt(0)
      .toUpperCase() || "?"
  );
};

function MessagePane({
  message,
  onShowMoreOptions,
  onShowEmoji,
  onEmojiClicked,
  currentUserId,
  onVoiceMessageListened
}) {
  const messageEmojis = message.emojis || [];
  const senderName = getSenderName(message);
  const senderImage = getSenderImage(message);

  return (
    <div className={styles.MessageContainer}>
      <div className={styles.MessageRow}>
        <div className={styles.AvatarColumn}>
          {senderImage ? (
            <img
              className={styles.AvatarImage}
              src={senderImage}
              alt={senderName}
            />
          ) : (
            <div className={styles.AvatarFallback}>
              {getInitial(senderName)}
            </div>
          )}
        </div>

        <div className={styles.ContentColumn}>
          <div className={styles.hoverItemsContainer}>
            <HoverItems
              currentUserId={currentUserId}
              message={message}
              onShowEmoji={event =>
                onShowEmoji &&
                onShowEmoji(message._id || message.message_id, event)
              }
              onShowMoreOptions={event =>
                onShowMoreOptions &&
                onShowMoreOptions(message._id || message.message_id, event)
              }
            />
          </div>

          <MessageBox
            message={message}
            onVoiceMessageListened={onVoiceMessageListened}
          />

          {messageEmojis.length > 0 ? (
            <div className={styles.emojiCardContainer}>
              {messageEmojis.map((emoji, i) => (
                <EmojiCard
                  key={`${emoji?.name || "emoji"}-${i}`}
                  emoji={emoji}
                  onEmojiClicked={event =>
                    onEmojiClicked &&
                    onEmojiClicked(
                      event,
                      emoji,
                      message._id || message.message_id
                    )
                  }
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

MessagePane.propTypes = {
  currentUserId: PropTypes.string,
  message: PropTypes.object.isRequired,
  onEmojiClicked: PropTypes.func,
  onShowEmoji: PropTypes.func,
  onShowMoreOptions: PropTypes.func,
  onVoiceMessageListened: PropTypes.func
};

export default MessagePane;
