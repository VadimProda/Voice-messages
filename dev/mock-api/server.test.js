/* eslint-env node, jest */
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const createTempDir = prefix => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

const waitForServerOutput = serverProcess =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Mock API did not start in time"));
    }, 10000);

    const handleReady = chunk => {
      const text = chunk.toString();
      if (text.includes("Local Zuri API listening on")) {
        clearTimeout(timeout);
        serverProcess.stdout.off("data", handleReady);
        resolve();
      }
    };

    serverProcess.stdout.on("data", handleReady);
    serverProcess.stderr.on("data", chunk => {
      clearTimeout(timeout);
      reject(new Error(chunk.toString()));
    });
  });

const request = ({ body, headers = {}, method = "GET", port, pathName }) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathName,
        method,
        headers
      },
      res => {
        const chunks = [];

        res.on("data", chunk => chunks.push(chunk));
        res.on("end", () => {
          const rawBody = Buffer.concat(chunks).toString("utf8");
          resolve({
            status: res.statusCode,
            body: rawBody ? JSON.parse(rawBody) : null
          });
        });
      }
    );

    req.on("error", reject);

    if (body) {
      req.write(body);
    }

    req.end();
  });

const requestJson = ({ body, headers = {}, method = "GET", port, pathName }) =>
  request({
    body: body ? JSON.stringify(body) : null,
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    method,
    port,
    pathName
  });

const requestMultipart = ({
  fields = {},
  file,
  headers = {},
  port,
  pathName
}) => {
  const boundary = `----codex-${Date.now()}`;
  const chunks = [];

  Object.entries(fields).forEach(([name, value]) => {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
      )
    );
  });

  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.fileName}"\r\nContent-Type: ${file.mimeType}\r\n\r\n`
    )
  );
  chunks.push(file.buffer);
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  const body = Buffer.concat(chunks);

  return request({
    body,
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": body.length,
      ...headers
    },
    method: "POST",
    port,
    pathName
  });
};

describe("local mock API", () => {
  const port = 5600 + Math.floor(Math.random() * 200);
  const dataDir = createTempDir("zuri-mock-data-");
  const uploadsDir = createTempDir("zuri-mock-uploads-");
  let serverProcess = null;

  beforeAll(async () => {
    serverProcess = spawn(
      process.execPath,
      [path.join(__dirname, "server.js")],
      {
        cwd: path.join(__dirname, "..", ".."),
        env: {
          ...process.env,
          MOCK_API_DATA_DIR: dataDir,
          MOCK_API_DATA_FILE: path.join(dataDir, "db.json"),
          MOCK_API_PORT: String(port),
          MOCK_API_UPLOADS_DIR: uploadsDir
        },
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    await waitForServerOutput(serverProcess);
  });

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill();
    }

    fs.rmSync(dataDir, { force: true, recursive: true });
    fs.rmSync(uploadsDir, { force: true, recursive: true });
  });

  test("supports the local auth, workspace and voice-message flow", async () => {
    const signupResponse = await requestJson({
      port,
      pathName: "/users",
      method: "POST",
      body: {
        email: "voice@example.com",
        first_name: "Voice",
        last_name: "Tester",
        password: "password-123"
      }
    });

    expect(signupResponse.status).toBe(200);
    expect(signupResponse.body.data.code).toBe("123456");

    const verifyResponse = await requestJson({
      port,
      pathName: "/account/verify-account",
      method: "POST",
      body: {
        code: "123456"
      }
    });

    expect(verifyResponse.status).toBe(200);

    const loginResponse = await requestJson({
      port,
      pathName: "/auth/login",
      method: "POST",
      body: {
        email: "voice@example.com",
        password: "password-123"
      }
    });

    expect(loginResponse.status).toBe(200);

    const token = loginResponse.body.data.user.token;

    const createWorkspaceResponse = await requestJson({
      port,
      pathName: "/organizations",
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: {
        creator_email: "voice@example.com",
        organization_name: "Voice QA Workspace",
        default_channel_name: "all-dms"
      }
    });

    expect(createWorkspaceResponse.status).toBe(200);

    const workspaceId = createWorkspaceResponse.body.data.organization_id;

    const voicePreferenceUpdate = await requestJson({
      port,
      pathName: `/users/${encodeURIComponent(
        "voice@example.com"
      )}/preferences/voice`,
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: {
        enabled: false
      }
    });

    expect(voicePreferenceUpdate.status).toBe(200);
    expect(voicePreferenceUpdate.body.data.enabled).toBe(false);

    const voicePreferenceRead = await requestJson({
      port,
      pathName: `/users/${encodeURIComponent(
        "voice@example.com"
      )}/preferences/voice`
    });

    expect(voicePreferenceRead.status).toBe(200);
    expect(voicePreferenceRead.body.data.enabled).toBe(false);

    const uploadResponse = await requestMultipart({
      port,
      pathName: "/files/voice",
      headers: {
        Authorization: `Bearer ${token}`
      },
      fields: {
        metadata: JSON.stringify({
          duration: 8,
          mimeType: "audio/mpeg",
          waveform: [18, 33, 48]
        })
      },
      file: {
        fileName: "standup.mp3",
        mimeType: "audio/mpeg",
        buffer: Buffer.from("voice-binary")
      }
    });

    expect(uploadResponse.status).toBe(201);
    expect(uploadResponse.body.data.mimeType).toBe("audio/mpeg");
    expect(uploadResponse.body.data.fileName).toBe("standup.mp3");
    expect(uploadResponse.body.data.sizeLabel).toBe("1 KB");

    const postMessageResponse = await requestJson({
      port,
      pathName: `/organizations/${workspaceId}/messages`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: {
        richUiData: {
          blocks: [{ key: "a", text: "Voice delivery", type: "unstyled" }],
          entityMap: {}
        },
        files: [],
        voiceMessage: {
          ...uploadResponse.body.data,
          transcript: "Local transcript",
          transcriptStatus: "done"
        }
      }
    });

    expect(postMessageResponse.status).toBe(201);
    expect(postMessageResponse.body.data.voiceMessage.transcript).toBe(
      "Local transcript"
    );

    const listenedResponse = await requestJson({
      port,
      pathName: `/messages/${postMessageResponse.body.data._id}/listened`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: {}
    });

    expect(listenedResponse.status).toBe(200);
    expect(listenedResponse.body.data.voiceMessage.listened).toBe(true);
  });

  test("rejects voice messages that exceed the 10 MB storage limit", async () => {
    const loginResponse = await requestJson({
      port,
      pathName: "/auth/login",
      method: "POST",
      body: {
        email: "voice@example.com",
        password: "password-123"
      }
    });

    const oversizedUploadResponse = await requestMultipart({
      port,
      pathName: "/files/voice",
      headers: {
        Authorization: `Bearer ${loginResponse.body.data.user.token}`
      },
      fields: {
        metadata: JSON.stringify({
          duration: 42,
          mimeType: "audio/ogg",
          waveform: [20, 40, 60]
        })
      },
      file: {
        fileName: "too-large.ogg",
        mimeType: "audio/ogg",
        buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 1)
      }
    });

    expect(oversizedUploadResponse.status).toBe(413);
    expect(oversizedUploadResponse.body.message).toMatch(/10 MB/i);
  });
});
