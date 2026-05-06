# ZC_MAIN

Zuri Chat frontend built with React, Webpack 5, and single-spa microfrontends.

This repository now includes a full local end-to-end voice messaging flow for demonstration and testing without depending on the public Zuri backend.

## Local Voice Messaging Implementation

The project contains a local backend adapter for voice-message development and demo scenarios.

With local mode you can verify:

- signup, account verification, login, and workspace creation
- microphone recording with timer, cancel, and auto-stop at 5 minutes
- voice preview before sending
- delete and re-record flow
- local file upload and storage
- persistence of voice messages in chat history
- playback with play/pause, waveform seek, progress slider, and duration
- download of recorded audio
- playback speed `1x`, `1.5x`, `2x`
- listened state
- privacy toggle with persisted preference
- optional transcription flow

## Local Setup

Install dependencies:

```bash
yarn install
```

Copy environment variables:

```bash
cp .env.example .env
```

Run the local frontend and local mock API together:

```bash
yarn dev:local
```

Or run them separately:

```bash
yarn mock-api
```

```bash
powershell -ExecutionPolicy Bypass -File dev/start-local.ps1
```

Local URLs:

- Frontend: [http://localhost:9000](http://localhost:9000)
- Local API: [http://localhost:5050](http://localhost:5050)

## Local Email Verification

No real email is sent in local mode.

Use this verification code during signup:

```text
123456
```

## Available Scripts

```bash
yarn dev
yarn mock-api
yarn dev:local
yarn test
yarn test:ui
yarn test:messaging
yarn build
yarn clean
yarn clean-fresh
```

## Tests

Run the full test suite:

```bash
yarn test
```

Run UI-focused tests only:

```bash
yarn test:ui
```

Run local messaging tests only:

```bash
yarn test:messaging
```

## Demo Flow

Recommended defense/demo scenario:

1. Start the app with `yarn dev:local`.
2. Open [http://localhost:9000](http://localhost:9000).
3. Sign up with a new account.
4. Verify the account using code `123456`.
5. Log in.
6. Create a workspace.
7. Open `all-dms`.
8. Record a voice message.
9. Show timer, stop, cancel, and preview states.
10. Send the voice message.
11. Play it back, seek on the waveform, change speed, and download it.
12. Reload the page and show that the message remains in history.
13. Optionally show `dev/mock-api/data/db.json` and `dev/mock-api/uploads/voice-messages` to demonstrate local persistence.

## Architecture Notes

For local verification, the project uses:

- a mock API in [`dev/mock-api/server.js`](dev/mock-api/server.js)
- local voice-file storage in `dev/mock-api/uploads/voice-messages`
- a local messaging microfrontend in [`packages/zuri-plugin-messaging/src/root.component.js`](packages/zuri-plugin-messaging/src/root.component.js)
- UI integration inside [`packages/ui/src/message-board/MessageBoard.jsx`](packages/ui/src/message-board/MessageBoard.jsx) and [`packages/ui/src/message-pane-input/MessagePaneInput.jsx`](packages/ui/src/message-pane-input/MessagePaneInput.jsx)

## Limitations

- The original production Zuri backend is not required for this local implementation.
- Voice transcription is implemented as an optional placeholder flow and can be replaced with a real STT provider later.
- Audio optimization is currently done on the client by recording with a lower bitrate. A dedicated server-side transcoding pipeline is not included.
- Real microphone capture still depends on browser and OS permission approval at runtime.

## Contributing

Useful docs:

- [Contribution Guide](docs/CONTRIBUTING.md)
- [Styling Guide](docs/STYLING.md)

Linting and formatting:

```bash
yarn lint
yarn lint:js
yarn prettify
```
