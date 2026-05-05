import { useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { FiDownload, FiPause, FiPlay } from "react-icons/fi";

import styles from "./voice-message-player.module.css";
import {
  formatAudioTime,
  getFallbackWaveform,
  normalizeVoiceMessage
} from "./voice-message.utils";

const PLAYBACK_RATES = [1, 1.5, 2];

export default function VoiceMessagePlayer({
  voiceMessage,
  compact = false,
  onListened
}) {
  const normalizedVoiceMessage = useMemo(
    () => normalizeVoiceMessage(voiceMessage),
    [voiceMessage]
  );
  const audioRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(normalizedVoiceMessage.duration || 0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [hasListened, setHasListened] = useState(
    Boolean(normalizedVoiceMessage.listened)
  );

  const waveform =
    normalizedVoiceMessage.waveform.length > 0
      ? normalizedVoiceMessage.waveform
      : getFallbackWaveform();
  const progress = duration > 0 ? currentTime / duration : 0;

  useEffect(() => {
    setDuration(normalizedVoiceMessage.duration || 0);
    setCurrentTime(0);
    setIsPlaying(false);
    setHasListened(Boolean(normalizedVoiceMessage.listened));
  }, [
    normalizedVoiceMessage.duration,
    normalizedVoiceMessage.listened,
    normalizedVoiceMessage.url
  ]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const markAsListened = () => {
    if (!hasListened) {
      setHasListened(true);
      onListened && onListened(normalizedVoiceMessage);
    }
  };

  const handleTogglePlayback = async () => {
    if (!audioRef.current || !normalizedVoiceMessage.url) {
      return;
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    try {
      await audioRef.current.play();
      setIsPlaying(true);
      markAsListened();
    } catch (error) {
      setIsPlaying(false);
    }
  };

  const handleTimeUpdate = event => {
    setCurrentTime(event.target.currentTime || 0);
  };

  const handleLoadedMetadata = event => {
    setDuration(event.target.duration || normalizedVoiceMessage.duration || 0);
  };

  const handlePlaybackEnd = () => {
    setIsPlaying(false);
    setCurrentTime(duration);
    markAsListened();
  };

  const handleSeek = index => {
    if (!audioRef.current || duration <= 0) {
      return;
    }

    const targetTime = (index / Math.max(1, waveform.length - 1)) * duration;
    audioRef.current.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  return (
    <div className={`${styles.player} ${compact ? styles.compact : ""}`}>
      <audio
        className={styles.hiddenAudio}
        ref={audioRef}
        preload="metadata"
        src={normalizedVoiceMessage.url}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onEnded={handlePlaybackEnd}
      />

      <div className={styles.mainRow}>
        <button
          type="button"
          className={styles.playButton}
          aria-label={isPlaying ? "Pause voice message" : "Play voice message"}
          onClick={handleTogglePlayback}
        >
          {isPlaying ? <FiPause size={18} /> : <FiPlay size={18} />}
        </button>

        <div className={styles.timeline}>
          <div className={styles.waveform}>
            {waveform.map((height, index) => {
              const played = progress >= index / waveform.length;

              return (
                <button
                  type="button"
                  key={`waveform-bar-${index}`}
                  className={`${styles.bar} ${
                    played ? styles.barPlayed : ""
                  }`}
                  style={{ height: `${height}%` }}
                  onClick={() => handleSeek(index)}
                  aria-label={`Seek to ${Math.round(
                    (index / waveform.length) * 100
                  )}%`}
                />
              );
            })}
          </div>

          <div className={styles.timeRow}>
            <span>{formatAudioTime(currentTime)}</span>
            <span>{formatAudioTime(duration)}</span>
          </div>
        </div>

        <div className={styles.downloadRow}>
          <button
            type="button"
            className={styles.rateButton}
            onClick={() => {
              const rateIndex =
                (PLAYBACK_RATES.indexOf(playbackRate) + 1) %
                PLAYBACK_RATES.length;
              setPlaybackRate(PLAYBACK_RATES[rateIndex]);
            }}
          >
            {playbackRate}x
          </button>

          <a
            className={styles.downloadButton}
            href={normalizedVoiceMessage.url}
            download={normalizedVoiceMessage.fileName}
          >
            <FiDownload size={16} />
          </a>
        </div>
      </div>

      <div className={styles.metaRow}>
        <span>
          {normalizedVoiceMessage.fileName}
          {normalizedVoiceMessage.sizeLabel
            ? ` - ${normalizedVoiceMessage.sizeLabel}`
            : ""}
        </span>

        {hasListened ? (
          <span className={styles.status}>Listened</span>
        ) : (
          <span>
            {normalizedVoiceMessage.transcriptStatus === "loading"
              ? "Transcribing..."
              : "New voice message"}
          </span>
        )}
      </div>

      {normalizedVoiceMessage.transcript ? (
        <div className={styles.transcript}>
          {normalizedVoiceMessage.transcript}
        </div>
      ) : null}
    </div>
  );
}

VoiceMessagePlayer.propTypes = {
  compact: PropTypes.bool,
  onListened: PropTypes.func,
  voiceMessage: PropTypes.shape({
    downloadUrl: PropTypes.string,
    duration: PropTypes.number,
    fileName: PropTypes.string,
    fileUrl: PropTypes.string,
    listened: PropTypes.bool,
    mimeType: PropTypes.string,
    name: PropTypes.string,
    sizeLabel: PropTypes.string,
    src: PropTypes.string,
    transcript: PropTypes.string,
    transcriptStatus: PropTypes.string,
    type: PropTypes.string,
    url: PropTypes.string,
    waveform: PropTypes.arrayOf(PropTypes.number)
  }).isRequired
};
