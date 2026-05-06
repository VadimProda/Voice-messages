import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { FiDownload, FiPause, FiPlay } from "react-icons/fi";

import styles from "./voice-message-player.module.css";
import {
  formatAudioTime,
  getFallbackWaveform,
  normalizeVoiceMessage
} from "./voice-message.utils";

const PLAYBACK_RATES = [1, 1.5, 2];

const clamp = (value, min, max) => {
  return Math.min(Math.max(value, min), max);
};

const getSafeDuration = value => {
  const duration = Number(value);

  return Number.isFinite(duration) && duration > 0 ? duration : 0;
};

export default function VoiceMessagePlayer({
  voiceMessage,
  compact = false,
  showMeta = true,
  showTranscript = true,
  onListened
}) {
  const normalizedVoiceMessage = useMemo(
    () => normalizeVoiceMessage(voiceMessage),
    [voiceMessage]
  );

  const audioRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(
    getSafeDuration(normalizedVoiceMessage.duration)
  );
  const [playbackRate, setPlaybackRate] = useState(1);
  const [hasListened, setHasListened] = useState(
    Boolean(normalizedVoiceMessage.listened)
  );

  const audioUrl = normalizedVoiceMessage.url;
  const downloadUrl =
    normalizedVoiceMessage.downloadUrl || normalizedVoiceMessage.url;

  const waveform = useMemo(() => {
    return normalizedVoiceMessage.waveform.length > 0
      ? normalizedVoiceMessage.waveform
      : getFallbackWaveform();
  }, [normalizedVoiceMessage.waveform]);

  const progress = duration > 0 ? clamp(currentTime / duration, 0, 1) : 0;
  const progressPercent = Math.round(progress * 100);
  const rangeValue = duration > 0 ? clamp(currentTime, 0, duration) : 0;

  useEffect(() => {
    setDuration(getSafeDuration(normalizedVoiceMessage.duration));
    setCurrentTime(0);
    setIsPlaying(false);
    setPlaybackRate(1);
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

  const markAsListened = useCallback(() => {
    if (hasListened) {
      return;
    }

    setHasListened(true);

    if (typeof onListened === "function") {
      onListened(normalizedVoiceMessage);
    }
  }, [hasListened, normalizedVoiceMessage, onListened]);

  const handleTogglePlayback = async () => {
    if (!audioRef.current || !audioUrl) {
      return;
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    try {
      audioRef.current.playbackRate = playbackRate;
      await audioRef.current.play();
      setIsPlaying(true);
      markAsListened();
    } catch (error) {
      setIsPlaying(false);
    }
  };

  const handleTimeUpdate = event => {
    const nextTime = getSafeDuration(event.target.currentTime);

    setCurrentTime(nextTime);

    if (duration > 0 && nextTime >= Math.min(2, duration * 0.8)) {
      markAsListened();
    }
  };

  const handleLoadedMetadata = event => {
    const metadataDuration = getSafeDuration(event.target.duration);
    const fallbackDuration = getSafeDuration(normalizedVoiceMessage.duration);

    setDuration(metadataDuration || fallbackDuration);
  };

  const handlePlaybackEnd = () => {
    setIsPlaying(false);
    setCurrentTime(duration);
    markAsListened();
  };

  const seekToTime = nextTime => {
    if (!audioRef.current || duration <= 0) {
      return;
    }

    const safeTime = clamp(Number(nextTime) || 0, 0, duration);

    audioRef.current.currentTime = safeTime;
    setCurrentTime(safeTime);
  };

  const handleWaveformSeek = index => {
    if (duration <= 0) {
      return;
    }

    const denominator = Math.max(1, waveform.length - 1);
    const targetTime = (index / denominator) * duration;

    seekToTime(targetTime);
  };

  const handleSliderChange = event => {
    seekToTime(event.target.value);
  };

  const handlePlaybackRateToggle = () => {
    const currentRateIndex = PLAYBACK_RATES.indexOf(playbackRate);
    const nextRateIndex = (currentRateIndex + 1) % PLAYBACK_RATES.length;
    const nextRate = PLAYBACK_RATES[nextRateIndex];

    setPlaybackRate(nextRate);

    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const playerClassName = [styles.player, compact ? styles.compact : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={playerClassName}>
      <audio
        ref={audioRef}
        className={styles.hiddenAudio}
        src={audioUrl}
        preload="metadata"
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
          onClick={handleTogglePlayback}
          disabled={!audioUrl}
          aria-label={isPlaying ? "Pause voice message" : "Play voice message"}
          title={isPlaying ? "Pause voice message" : "Play voice message"}
        >
          {isPlaying ? <FiPause size={18} /> : <FiPlay size={18} />}
        </button>

        <div className={styles.timeline}>
          <div
            className={styles.waveform}
            aria-label={`Voice message waveform. ${progressPercent}% played.`}
          >
            {waveform.map((height, index) => {
              const played = progress >= index / Math.max(1, waveform.length);

              return (
                <button
                  key={`${height}-${index}`}
                  type="button"
                  className={`${styles.bar} ${played ? styles.barPlayed : ""}`}
                  style={{ height: `${Math.max(12, height)}%` }}
                  onClick={() => handleWaveformSeek(index)}
                  disabled={duration <= 0}
                  aria-label={`Seek to ${Math.round(
                    (index / Math.max(1, waveform.length - 1)) * 100
                  )}%`}
                />
              );
            })}
          </div>

          <label className={styles.progressSliderLabel}>
            <span className={styles.visuallyHidden}>
              Voice message playback progress
            </span>

            <input
              className={styles.progressSlider}
              type="range"
              min="0"
              max={duration || 0}
              step="0.1"
              value={rangeValue}
              disabled={duration <= 0}
              onChange={handleSliderChange}
              aria-label="Voice message playback progress"
              aria-valuetext={`${formatAudioTime(
                currentTime
              )} of ${formatAudioTime(duration)}`}
            />
          </label>

          <div className={styles.timeRow}>
            <span>{formatAudioTime(currentTime)}</span>
            <span>{formatAudioTime(duration)}</span>
          </div>
        </div>

        <div className={styles.downloadRow}>
          <button
            type="button"
            className={styles.rateButton}
            onClick={handlePlaybackRateToggle}
            aria-label={`Playback speed ${playbackRate}x. Click to change.`}
            title="Change playback speed"
          >
            {playbackRate}x
          </button>

          {downloadUrl ? (
            <a
              className={styles.downloadButton}
              href={downloadUrl}
              download={normalizedVoiceMessage.fileName}
              aria-label={`Download ${normalizedVoiceMessage.fileName}`}
              title={`Download ${normalizedVoiceMessage.fileName}`}
            >
              <FiDownload size={16} />
              <span className={styles.downloadText}>Download</span>
            </a>
          ) : (
            <span className={styles.unavailableDownload}>No download</span>
          )}
        </div>
      </div>

      {showMeta ? (
        <div className={styles.metaRow}>
          <div className={styles.metaText}>
            <span className={styles.fileName}>
              {normalizedVoiceMessage.fileName}
            </span>

            {normalizedVoiceMessage.sizeLabel ? (
              <span>{normalizedVoiceMessage.sizeLabel}</span>
            ) : null}
          </div>

          <span className={styles.status}>
            {hasListened
              ? "Listened"
              : normalizedVoiceMessage.transcriptStatus === "loading"
              ? "Transcribing..."
              : "New voice message"}
          </span>
        </div>
      ) : null}

      {showTranscript && normalizedVoiceMessage.transcript ? (
        <p className={styles.transcript}>{normalizedVoiceMessage.transcript}</p>
      ) : null}
    </article>
  );
}

VoiceMessagePlayer.propTypes = {
  compact: PropTypes.bool,
  onListened: PropTypes.func,
  showMeta: PropTypes.bool,
  showTranscript: PropTypes.bool,
  voiceMessage: PropTypes.shape({
    downloadUrl: PropTypes.string,
    duration: PropTypes.number,
    durationSeconds: PropTypes.number,
    file: PropTypes.object,
    fileId: PropTypes.string,
    fileName: PropTypes.string,
    fileUrl: PropTypes.string,
    id: PropTypes.string,
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
