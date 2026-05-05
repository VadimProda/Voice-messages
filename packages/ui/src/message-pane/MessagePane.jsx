import PropTypes from "prop-types";

import MessageBox from "./components/message-box/MessageBox";
import HoverItems from "./components/hover-items/HoverItems";
import EmojiCard from "./components/emoji-card/EmojiCard";

import styles from "./message-pane.module.css";

function MessagePane({
  message,
  onShowMoreOptions,
  onShowEmoji,
  onEmojiClicked,
  currentUserId,
  onVoiceMessageListened
}) {
  const messageEmojis = message.emojis || [];

  return (
    <div className={styles.MessageContainer}>
      <div id="hoverItems" className={styles.hoverItemsContainer}>
        <HoverItems
          id={message._id}
          handleShowMoreOptions={onShowMoreOptions}
          handleShowEmoji={onShowEmoji}
        />
      </div>
      <div className={styles.messageCardContainer}>
        <MessageBox
          id={message.message_id}
          message={message}
          onVoiceMessageListened={onVoiceMessageListened}
        />
      </div>
      <div className={styles.emojiCardContainer}>
        {messageEmojis.map((emoji, i) => (
            <div
              onClick={event => onEmojiClicked(event, emoji, message._id)}
              key={i}
            >
              <EmojiCard currentUserId={currentUserId} emojiObject={emoji} />
            </div>
          ))}

        {messageEmojis.length > 0 ? (
          <div onClick={event => onShowEmoji(message._id, event)}>
            <EmojiCard emojiSvg={true} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

MessagePane.propTypes = {
  currentUserId: PropTypes.string,
  message: PropTypes.object.isRequired,
  onVoiceMessageListened: PropTypes.func,
  onSendMessage: PropTypes.func,
  onSendAttachedFile: PropTypes.func,
  onReact: PropTypes.func
};

export default MessagePane;
