/* eslint-env node */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const PORT = Number(process.env.MOCK_API_PORT || 5050);

const DATA_DIR = process.env.MOCK_API_DATA_DIR || path.join(__dirname, "data");
const DATA_FILE =
  process.env.MOCK_API_DATA_FILE || path.join(DATA_DIR, "db.json");

const UPLOADS_DIR =
  process.env.MOCK_API_UPLOADS_DIR || path.join(__dirname, "uploads");
const VOICE_UPLOAD_DIR = path.join(UPLOADS_DIR, "voice-messages");

const MAX_JSON_BODY_BYTES = 5 * 1024 * 1024;
const MAX_MULTIPART_BODY_BYTES = 12 * 1024 * 1024;
const MAX_VOICE_FILE_BYTES = 10 * 1024 * 1024;
const MAX_VOICE_DURATION_SECONDS = 5 * 60;

const BASE_PUBLIC_URL = `http://localhost:${PORT}`;

const AUDIO_MIME_TO_EXTENSION = new Map([
  ["audio/ogg", "ogg"],
  ["audio/oga", "ogg"],
  ["audio/opus", "ogg"],
  ["audio/mpeg", "mp3"],
  ["audio/mp3", "mp3"],
  ["audio/webm", "webm"],
  ["audio/mp4", "m4a"],
  ["audio/x-m4a", "m4a"],
  ["audio/wav", "wav"],
  ["audio/wave", "wav"],
  ["audio/x-wav", "wav"]
]);

function ensureDir(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true });
  }
}

function initialDbState() {
  return {
    users: [],
    organizations: [],
    channels: [],
    messages: [],
    files: [],
    voiceListens: [],
    voicePreferences: [],
    installs: []
  };
}

function ensureDb() {
  ensureDir(DATA_DIR);
  ensureDir(VOICE_UPLOAD_DIR);

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialDbState(), null, 2));
  }
}

function createId(prefix) {
  return `${prefix}-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function normalizeChannelName(name) {
  return (
    String(name || "all-dms")
      .trim()
      .toLowerCase()
      .replace(/^#/, "")
      .replace(/[^a-z0-9-_]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "all-dms"
  );
}

function createChannel(workspaceId, name = "all-dms", creatorId = "system") {
  const channelName = normalizeChannelName(name);

  return {
    id: createId("channel"),
    workspace_id: workspaceId,
    name: channelName,
    display_name: channelName,
    type: "public",
    created_by: creatorId,
    created_at: new Date().toISOString()
  };
}

function normalizeDbShape(db) {
  const nextDb = db && typeof db === "object" ? db : initialDbState();

  const defaults = initialDbState();
  Object.keys(defaults).forEach(key => {
    if (!Array.isArray(nextDb[key])) {
      nextDb[key] = [];
    }
  });

  nextDb.organizations = nextDb.organizations.map(org => {
    const members = Array.isArray(org.members) ? org.members : [];
    const memberEmails = Array.isArray(org.memberEmails)
      ? org.memberEmails
      : members.map(member => member.email).filter(Boolean);

    return {
      ...org,
      members,
      memberEmails,
      installedPlugins: Array.isArray(org.installedPlugins)
        ? org.installedPlugins
        : []
    };
  });

  nextDb.organizations.forEach(org => {
    const hasChannel = nextDb.channels.some(
      channel => channel.workspace_id === org.id
    );

    if (!hasChannel) {
      nextDb.channels.push(
        createChannel(org.id, "all-dms", org.creator_email || "system")
      );
    }
  });

  return nextDb;
}

function readDb() {
  ensureDb();

  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    const normalized = normalizeDbShape(parsed);
    writeDb(normalized);
    return normalized;
  } catch (error) {
    const fallback = initialDbState();
    writeDb(fallback);
    return fallback;
  }
}

function writeDb(db) {
  ensureDir(DATA_DIR);
  fs.writeFileSync(DATA_FILE, JSON.stringify(normalizeDbShape(db), null, 2));
}

function withCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
}

function sendJson(res, statusCode, payload) {
  withCors(res);
  res.writeHead(statusCode, {
    "Content-Type": "application/json"
  });
  res.end(JSON.stringify(payload));
}

function notFound(res, message = "Not found") {
  sendJson(res, 404, {
    status: 404,
    message
  });
}

function badRequest(res, message) {
  sendJson(res, 400, {
    status: 400,
    message
  });
}

function parseJsonBody(req, maxBytes = MAX_JSON_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let receivedBytes = 0;

    req.on("data", chunk => {
      receivedBytes += chunk.length;

      if (receivedBytes > maxBytes) {
        reject(new Error("Request body is too large"));
        return;
      }

      raw += chunk.toString();
    });

    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });

    req.on("error", reject);
  });
}

function parseMultipartBody(req, contentType) {
  return new Promise((resolve, reject) => {
    const boundaryMatch = String(contentType || "").match(
      /boundary=(?:"([^"]+)"|([^;]+))/i
    );

    if (!boundaryMatch) {
      reject(new Error("Missing multipart boundary"));
      return;
    }

    const boundary = boundaryMatch[1] || boundaryMatch[2];
    const chunks = [];
    let receivedBytes = 0;

    req.on("data", chunk => {
      receivedBytes += chunk.length;

      if (receivedBytes > MAX_MULTIPART_BODY_BYTES) {
        reject(new Error("Multipart body is too large"));
        return;
      }

      chunks.push(chunk);
    });

    req.on("end", () => {
      const buffer = Buffer.concat(chunks);
      const raw = buffer.toString("latin1");
      const boundaryMarker = `--${boundary}`;
      const rawParts = raw.split(boundaryMarker);

      const fields = {};
      const files = {};

      rawParts.forEach(part => {
        let currentPart = part;

        if (!currentPart || currentPart === "--" || currentPart === "--\r\n") {
          return;
        }

        if (currentPart.startsWith("\r\n")) {
          currentPart = currentPart.slice(2);
        }

        if (currentPart.endsWith("\r\n")) {
          currentPart = currentPart.slice(0, -2);
        }

        if (currentPart.endsWith("--")) {
          currentPart = currentPart.slice(0, -2);
        }

        const headerEndIndex = currentPart.indexOf("\r\n\r\n");

        if (headerEndIndex === -1) {
          return;
        }

        const rawHeaders = currentPart.slice(0, headerEndIndex);
        const rawContent = currentPart.slice(headerEndIndex + 4);

        const contentDisposition = rawHeaders
          .split("\r\n")
          .find(header =>
            header.toLowerCase().startsWith("content-disposition")
          );

        if (!contentDisposition) {
          return;
        }

        const nameMatch = contentDisposition.match(/name="([^"]+)"/);
        const filenameMatch = contentDisposition.match(/filename="([^"]*)"/);

        if (!nameMatch) {
          return;
        }

        const fieldName = nameMatch[1];

        if (filenameMatch) {
          const contentTypeHeader = rawHeaders
            .split("\r\n")
            .find(header => header.toLowerCase().startsWith("content-type"));

          const fileContentType = contentTypeHeader
            ? contentTypeHeader.split(":").slice(1).join(":").trim()
            : "application/octet-stream";

          files[fieldName] = {
            fieldName,
            filename: filenameMatch[1],
            contentType: fileContentType,
            buffer: Buffer.from(rawContent, "latin1")
          };

          return;
        }

        fields[fieldName] = Buffer.from(rawContent, "latin1").toString("utf8");
      });

      resolve({
        fields,
        files
      });
    });

    req.on("error", reject);
  });
}

function getAuthorizationToken(req) {
  const header = req.headers.authorization || "";
  return header.replace(/^Bearer\s+/i, "").trim();
}

function findUserByToken(db, token) {
  if (!token) {
    return null;
  }

  return db.users.find(user => user.token === token) || null;
}

function findUserByEmail(db, email) {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  return db.users.find(user => user.email === normalizedEmail) || null;
}

function getUserDisplayName(user) {
  const fullName = [user?.first_name, user?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName || user?.email || "Unknown User";
}

function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    token: user.token,
    verified: user.verified
  };
}

function workspaceSummary(workspace) {
  return {
    id: workspace.id,
    name: workspace.name,
    no_of_members: Array.isArray(workspace.members)
      ? workspace.members.length
      : 0,
    workspace_url: workspace.workspace_url
  };
}

function getFileExtensionFromMimeType(mimeType, fallbackFileName) {
  const normalizedMimeType = String(mimeType || "")
    .split(";")[0]
    .trim();

  if (AUDIO_MIME_TO_EXTENSION.has(normalizedMimeType)) {
    return AUDIO_MIME_TO_EXTENSION.get(normalizedMimeType);
  }

  const fallbackExtension = path
    .extname(String(fallbackFileName || ""))
    .replace(".", "")
    .toLowerCase();

  if (fallbackExtension) {
    return fallbackExtension;
  }

  return "ogg";
}

function getMimeTypeByExtension(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case ".ogg":
    case ".oga":
      return "audio/ogg";
    case ".mp3":
      return "audio/mpeg";
    case ".webm":
      return "audio/webm";
    case ".m4a":
    case ".mp4":
      return "audio/mp4";
    case ".wav":
      return "audio/wav";
    default:
      return "application/octet-stream";
  }
}

function safeJsonParse(value, fallback) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function normalizeNumber(value, fallback = 0) {
  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

function normalizeWaveform(value) {
  if (Array.isArray(value)) {
    return value.map(point => normalizeNumber(point, 0));
  }

  if (typeof value === "string") {
    const parsedValue = safeJsonParse(value, []);
    return Array.isArray(parsedValue)
      ? parsedValue.map(point => normalizeNumber(point, 0))
      : [];
  }

  return [];
}

function formatFileSizeLabel(bytes) {
  const normalizedBytes = normalizeNumber(bytes, 0);
  const megabytes = normalizedBytes / (1024 * 1024);

  if (megabytes >= 1) {
    return `${megabytes.toFixed(2)} MB`;
  }

  return `${Math.max(1, Math.round(normalizedBytes / 1024))} KB`;
}

function createEmptyRichText(text = "") {
  return {
    blocks: [
      {
        key: randomUUID().slice(0, 5),
        text,
        type: "unstyled",
        depth: 0,
        inlineStyleRanges: [],
        entityRanges: [],
        data: {}
      }
    ],
    entityMap: {}
  };
}

function getChannelById(db, channelId) {
  return db.channels.find(channel => channel.id === channelId) || null;
}

function getDefaultChannelForWorkspace(db, workspaceId) {
  let channel =
    db.channels.find(
      item => item.workspace_id === workspaceId && item.name === "all-dms"
    ) || db.channels.find(item => item.workspace_id === workspaceId);

  if (!channel) {
    channel = createChannel(workspaceId, "all-dms");
    db.channels.push(channel);
    writeDb(db);
  }

  return channel;
}

function serveUploadFile(pathname, res) {
  const uploadMatch = pathname.match(/^\/uploads\/voice-messages\/([^/]+)$/);

  if (!uploadMatch) {
    return false;
  }

  const safeName = path.basename(uploadMatch[1]);
  const filePath = path.join(VOICE_UPLOAD_DIR, safeName);

  if (!fs.existsSync(filePath)) {
    notFound(res, "Uploaded file not found");
    return true;
  }

  const mimeType = getMimeTypeByExtension(filePath);

  withCors(res);
  res.writeHead(200, {
    "Content-Type": mimeType,
    "Content-Length": fs.statSync(filePath).size,
    "Accept-Ranges": "bytes"
  });

  fs.createReadStream(filePath).pipe(res);
  return true;
}

function createMessageFromBody({ db, channel, user, body }) {
  const now = Date.now();
  const messageId = `message-${randomUUID().replace(/-/g, "").slice(0, 16)}`;

  return {
    _id: messageId,
    message_id: now,
    channel_id: channel.id,
    workspace_id: channel.workspace_id,
    sender_id: user.id,
    sender: {
      sender_name: getUserDisplayName(user),
      sender_image_url: ""
    },
    timestamp: now,
    emojis: [],
    files: Array.isArray(body.files) ? body.files : [],
    richUiData: body.richUiData || createEmptyRichText(""),
    voiceMessage: body.voiceMessage || null
  };
}

async function handleVoiceFileUpload(req, res, db) {
  const token = getAuthorizationToken(req);
  const user = findUserByToken(db, token);

  if (!user) {
    sendJson(res, 401, {
      status: 401,
      message: "Unauthorized"
    });
    return;
  }

  const { fields, files } = await parseMultipartBody(
    req,
    req.headers["content-type"]
  );

  const uploadedFile = files.file || files.audio || files.voice;

  if (!uploadedFile) {
    badRequest(res, "Voice file is required");
    return;
  }

  const metadata = safeJsonParse(fields.metadata, {});
  const mimeType = String(
    uploadedFile.contentType || metadata.mimeType || "application/octet-stream"
  )
    .split(";")[0]
    .trim();

  const isKnownAudioType = AUDIO_MIME_TO_EXTENSION.has(mimeType);
  const isGenericAudioType = mimeType.startsWith("audio/");

  if (!isKnownAudioType && !isGenericAudioType) {
    sendJson(res, 415, {
      status: 415,
      message: `Unsupported audio format: ${mimeType}`
    });
    return;
  }

  if (uploadedFile.buffer.length > MAX_VOICE_FILE_BYTES) {
    sendJson(res, 413, {
      status: 413,
      message: "Voice file is larger than 10 MB"
    });
    return;
  }

  const duration = normalizeNumber(metadata.duration || fields.duration, 0);

  if (duration > MAX_VOICE_DURATION_SECONDS) {
    badRequest(res, "Voice message duration cannot exceed 5 minutes");
    return;
  }

  const fileId = createId("voice");
  const extension = getFileExtensionFromMimeType(
    mimeType,
    uploadedFile.filename
  );

  const storedFileName = `${fileId}.${extension}`;
  const storedFilePath = path.join(VOICE_UPLOAD_DIR, storedFileName);

  fs.writeFileSync(storedFilePath, uploadedFile.buffer);

  const waveform = normalizeWaveform(metadata.waveform || fields.waveform);
  const url = `${BASE_PUBLIC_URL}/uploads/voice-messages/${storedFileName}`;

  const fileRecord = {
    id: fileId,
    type: "voice",
    fileId,
    fileName: uploadedFile.filename || storedFileName,
    storedFileName,
    url,
    downloadUrl: url,
    mimeType,
    size: uploadedFile.buffer.length,
    sizeLabel: formatFileSizeLabel(uploadedFile.buffer.length),
    duration,
    waveform,
    uploadedBy: user.id,
    uploadedByEmail: user.email,
    created_at: new Date().toISOString()
  };

  db.files.push(fileRecord);
  writeDb(db);

  sendJson(res, 201, {
    status: 201,
    message: "Voice file uploaded",
    data: fileRecord
  });
}

const server = http.createServer(async (req, res) => {
  withCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (serveUploadFile(pathname, res)) {
    return;
  }

  const db = readDb();

  try {
    if (req.method === "GET" && pathname === "/health") {
      sendJson(res, 200, {
        status: 200,
        message: "ok",
        data: {
          service: "zuri-local-api",
          port: PORT
        }
      });
      return;
    }

    if (req.method === "POST" && pathname === "/users") {
      const body = await parseJsonBody(req);
      const email = String(body.email || "")
        .trim()
        .toLowerCase();

      if (!email || !body.password || !body.first_name) {
        badRequest(res, "Missing required signup fields");
        return;
      }

      const existingUser = findUserByEmail(db, email);

      if (existingUser) {
        badRequest(res, "User with email already exists");
        return;
      }

      const verificationCode = "123456";

      const user = {
        id: randomUUID(),
        email,
        password: body.password,
        first_name: body.first_name,
        last_name: body.last_name || "",
        verified: false,
        verificationCode,
        token: `token-${randomUUID()}`
      };

      db.users.push(user);
      writeDb(db);

      sendJson(res, 200, {
        status: 200,
        message: "Verification code sent",
        data: {
          InsertedId: user.id,
          code: verificationCode
        }
      });
      return;
    }

    if (req.method === "POST" && pathname === "/account/verify-account") {
      const body = await parseJsonBody(req);
      const code = String(body.code || "").trim();

      const user = db.users.find(item => item.verificationCode === code);

      if (!user) {
        badRequest(res, "Invalid verification code");
        return;
      }

      user.verified = true;
      user.verificationCode = null;
      writeDb(db);

      sendJson(res, 200, {
        status: 200,
        message: "Account verified successfully",
        data: sanitizeUser(user)
      });
      return;
    }

    if (req.method === "POST" && pathname === "/auth/login") {
      const body = await parseJsonBody(req);
      const email = String(body.email || "")
        .trim()
        .toLowerCase();
      const password = String(body.password || "");

      const user = findUserByEmail(db, email);

      if (!user) {
        sendJson(res, 404, {
          status: 404,
          message: "User not found"
        });
        return;
      }

      if (user.password !== password) {
        sendJson(res, 401, {
          status: 401,
          message: "Invalid login credentials"
        });
        return;
      }

      if (!user.verified) {
        sendJson(res, 403, {
          status: 403,
          message: "Account not verified"
        });
        return;
      }

      user.token = `token-${randomUUID()}`;
      writeDb(db);

      sendJson(res, 200, {
        status: 200,
        data: {
          user: sanitizeUser(user),
          session_id: randomUUID()
        }
      });
      return;
    }

    if (req.method === "POST" && pathname === "/auth/logout") {
      sendJson(res, 200, {
        status: 200,
        message: "Logged out"
      });
      return;
    }

    const userOrganizationsMatch = pathname.match(
      /^\/users\/([^/]+)\/organizations$/
    );

    if (req.method === "GET" && userOrganizationsMatch) {
      const email = decodeURIComponent(userOrganizationsMatch[1]).toLowerCase();

      const workspaces = db.organizations
        .filter(org => org.memberEmails.includes(email))
        .map(workspaceSummary);

      sendJson(res, 200, {
        status: 200,
        data: workspaces
      });
      return;
    }

    if (req.method === "POST" && pathname === "/organizations") {
      const token = getAuthorizationToken(req);
      const user = findUserByToken(db, token);
      const body = await parseJsonBody(req);

      const creatorEmail = String(body.creator_email || user?.email || "")
        .trim()
        .toLowerCase();

      if (!user || user.email !== creatorEmail) {
        sendJson(res, 401, {
          status: 401,
          message: "Unauthorized"
        });
        return;
      }

      const organizationId = createId("org");
      const memberId = createId("member");

      const workspace = {
        id: organizationId,
        name: body.organization_name || body.name || "New Workspace",
        workspace_url: `${organizationId}.localhost`,
        creator_email: creatorEmail,
        members: [
          {
            _id: memberId,
            id: memberId,
            email: creatorEmail,
            user_id: user.id,
            display_name: getUserDisplayName(user)
          }
        ],
        memberEmails: [creatorEmail],
        installedPlugins: []
      };

      db.organizations.push(workspace);

      const defaultChannel = createChannel(
        organizationId,
        body.default_channel_name || "all-dms",
        user.id
      );

      db.channels.push(defaultChannel);
      writeDb(db);

      sendJson(res, 200, {
        status: 200,
        data: {
          organization_id: organizationId,
          default_channel_id: defaultChannel.id
        }
      });
      return;
    }

    const renameWorkspaceMatch = pathname.match(
      /^\/organizations\/([^/]+)\/name$/
    );

    if (req.method === "PATCH" && renameWorkspaceMatch) {
      const token = getAuthorizationToken(req);
      const user = findUserByToken(db, token);
      const workspace = db.organizations.find(
        org => org.id === renameWorkspaceMatch[1]
      );
      const body = await parseJsonBody(req);

      if (!user || !workspace) {
        notFound(res, "Workspace not found");
        return;
      }

      if (!workspace.memberEmails.includes(user.email)) {
        sendJson(res, 403, {
          status: 403,
          message: "Forbidden"
        });
        return;
      }

      workspace.name = body.organization_name || workspace.name;
      writeDb(db);

      sendJson(res, 200, {
        status: 200,
        data: workspaceSummary(workspace)
      });
      return;
    }

    const workspaceMembersMatch = pathname.match(
      /^\/organizations\/([^/]+)\/members\/?$/
    );

    if (req.method === "GET" && workspaceMembersMatch) {
      const workspace = db.organizations.find(
        org => org.id === workspaceMembersMatch[1]
      );

      if (!workspace) {
        notFound(res, "Workspace not found");
        return;
      }

      const query = String(url.searchParams.get("query") || "").toLowerCase();

      const members = workspace.members.filter(
        member => !query || member.email.toLowerCase().includes(query)
      );

      sendJson(res, 200, {
        status: 200,
        data: members
      });
      return;
    }

    const workspaceChannelsMatch = pathname.match(
      /^\/organizations\/([^/]+)\/channels$/
    );

    if (req.method === "GET" && workspaceChannelsMatch) {
      const workspaceId = workspaceChannelsMatch[1];
      const workspace = db.organizations.find(org => org.id === workspaceId);

      if (!workspace) {
        notFound(res, "Workspace not found");
        return;
      }

      getDefaultChannelForWorkspace(db, workspaceId);

      const channels = db.channels.filter(
        channel => channel.workspace_id === workspaceId
      );

      sendJson(res, 200, {
        status: 200,
        data: channels
      });
      return;
    }

    if (req.method === "POST" && workspaceChannelsMatch) {
      const token = getAuthorizationToken(req);
      const user = findUserByToken(db, token);
      const workspaceId = workspaceChannelsMatch[1];
      const workspace = db.organizations.find(org => org.id === workspaceId);
      const body = await parseJsonBody(req);

      if (!user || !workspace) {
        notFound(res, "Workspace not found");
        return;
      }

      if (!workspace.memberEmails.includes(user.email)) {
        sendJson(res, 403, {
          status: 403,
          message: "Forbidden"
        });
        return;
      }

      const channel = createChannel(
        workspaceId,
        body.name || body.channel_name || "channel",
        user.id
      );

      db.channels.push(channel);
      writeDb(db);

      sendJson(res, 201, {
        status: 201,
        data: channel
      });
      return;
    }

    const channelMessagesMatch = pathname.match(
      /^\/channels\/([^/]+)\/messages$/
    );

    if (req.method === "GET" && channelMessagesMatch) {
      const channelId = channelMessagesMatch[1];
      const channel = getChannelById(db, channelId);

      if (!channel) {
        notFound(res, "Channel not found");
        return;
      }

      const messages = db.messages.filter(
        message => message.channel_id === channelId
      );

      sendJson(res, 200, {
        status: 200,
        data: messages
      });
      return;
    }

    if (req.method === "POST" && channelMessagesMatch) {
      const token = getAuthorizationToken(req);
      const user = findUserByToken(db, token);
      const channelId = channelMessagesMatch[1];
      const channel = getChannelById(db, channelId);
      const body = await parseJsonBody(req);

      if (!user) {
        sendJson(res, 401, {
          status: 401,
          message: "Unauthorized"
        });
        return;
      }

      if (!channel) {
        notFound(res, "Channel not found");
        return;
      }

      const message = createMessageFromBody({
        db,
        channel,
        user,
        body
      });

      db.messages.push(message);
      writeDb(db);

      sendJson(res, 201, {
        status: 201,
        data: message
      });
      return;
    }

    const defaultWorkspaceMessagesMatch = pathname.match(
      /^\/organizations\/([^/]+)\/messages$/
    );

    if (req.method === "GET" && defaultWorkspaceMessagesMatch) {
      const workspaceId = defaultWorkspaceMessagesMatch[1];
      const workspace = db.organizations.find(org => org.id === workspaceId);

      if (!workspace) {
        notFound(res, "Workspace not found");
        return;
      }

      const channel = getDefaultChannelForWorkspace(db, workspaceId);

      const messages = db.messages.filter(
        message => message.channel_id === channel.id
      );

      sendJson(res, 200, {
        status: 200,
        data: {
          channel,
          messages
        }
      });
      return;
    }

    if (req.method === "POST" && defaultWorkspaceMessagesMatch) {
      const token = getAuthorizationToken(req);
      const user = findUserByToken(db, token);
      const workspaceId = defaultWorkspaceMessagesMatch[1];
      const workspace = db.organizations.find(org => org.id === workspaceId);
      const body = await parseJsonBody(req);

      if (!user) {
        sendJson(res, 401, {
          status: 401,
          message: "Unauthorized"
        });
        return;
      }

      if (!workspace) {
        notFound(res, "Workspace not found");
        return;
      }

      const channel = getDefaultChannelForWorkspace(db, workspaceId);

      const message = createMessageFromBody({
        db,
        channel,
        user,
        body
      });

      db.messages.push(message);
      writeDb(db);

      sendJson(res, 201, {
        status: 201,
        data: message
      });
      return;
    }

    if (req.method === "POST" && pathname === "/files/voice") {
      await handleVoiceFileUpload(req, res, db);
      return;
    }

    const getFileMatch = pathname.match(/^\/files\/([^/]+)$/);

    if (req.method === "GET" && getFileMatch) {
      const file = db.files.find(item => item.id === getFileMatch[1]);

      if (!file) {
        notFound(res, "File not found");
        return;
      }

      sendJson(res, 200, {
        status: 200,
        data: file
      });
      return;
    }

    const listenedMatch = pathname.match(/^\/messages\/([^/]+)\/listened$/);

    if (req.method === "POST" && listenedMatch) {
      const token = getAuthorizationToken(req);
      const user = findUserByToken(db, token);

      if (!user) {
        sendJson(res, 401, {
          status: 401,
          message: "Unauthorized"
        });
        return;
      }

      const messageId = listenedMatch[1];
      const message = db.messages.find(
        item =>
          String(item._id) === String(messageId) ||
          String(item.message_id) === String(messageId)
      );

      if (!message || !message.voiceMessage) {
        notFound(res, "Voice message not found");
        return;
      }

      const listenedBy = new Set(message.voiceMessage.listenedBy || []);
      listenedBy.add(user.id);

      message.voiceMessage = {
        ...message.voiceMessage,
        listened: true,
        listenedBy: Array.from(listenedBy)
      };

      db.voiceListens.push({
        id: createId("listen"),
        message_id: message._id,
        user_id: user.id,
        listened_at: new Date().toISOString()
      });

      writeDb(db);

      sendJson(res, 200, {
        status: 200,
        data: message
      });
      return;
    }

    const transcriptionMatch = pathname.match(
      /^\/messages\/([^/]+)\/transcription$/
    );

    if (req.method === "POST" && transcriptionMatch) {
      const token = getAuthorizationToken(req);
      const user = findUserByToken(db, token);
      const body = await parseJsonBody(req);

      if (!user) {
        sendJson(res, 401, {
          status: 401,
          message: "Unauthorized"
        });
        return;
      }

      const messageId = transcriptionMatch[1];
      const message = db.messages.find(
        item =>
          String(item._id) === String(messageId) ||
          String(item.message_id) === String(messageId)
      );

      if (!message || !message.voiceMessage) {
        notFound(res, "Voice message not found");
        return;
      }

      const transcript =
        body.transcript ||
        message.voiceMessage.transcript ||
        "Local transcription placeholder. Connect a real STT service to replace this text.";

      message.voiceMessage = {
        ...message.voiceMessage,
        transcript,
        transcriptStatus: "done"
      };

      writeDb(db);

      sendJson(res, 200, {
        status: 200,
        data: {
          transcript
        }
      });
      return;
    }

    const voicePreferenceMatch = pathname.match(
      /^\/users\/([^/]+)\/preferences\/voice$/
    );

    if (req.method === "GET" && voicePreferenceMatch) {
      const email = decodeURIComponent(voicePreferenceMatch[1]).toLowerCase();
      const preference = db.voicePreferences.find(item => item.email === email);

      sendJson(res, 200, {
        status: 200,
        data: preference || {
          email,
          enabled: true
        }
      });
      return;
    }

    if (req.method === "PATCH" && voicePreferenceMatch) {
      const token = getAuthorizationToken(req);
      const user = findUserByToken(db, token);
      const email = decodeURIComponent(voicePreferenceMatch[1]).toLowerCase();
      const body = await parseJsonBody(req);

      if (!user || user.email !== email) {
        sendJson(res, 401, {
          status: 401,
          message: "Unauthorized"
        });
        return;
      }

      const existingPreference = db.voicePreferences.find(
        item => item.email === email
      );

      if (existingPreference) {
        existingPreference.enabled = Boolean(body.enabled);
        existingPreference.updated_at = new Date().toISOString();
      } else {
        db.voicePreferences.push({
          id: createId("voice-pref"),
          email,
          enabled: Boolean(body.enabled),
          updated_at: new Date().toISOString()
        });
      }

      writeDb(db);

      sendJson(res, 200, {
        status: 200,
        data: db.voicePreferences.find(item => item.email === email)
      });
      return;
    }

    if (req.method === "GET" && pathname === "/marketplace/plugins") {
      sendJson(res, 200, {
        status: 200,
        data: {
          plugins: [
            {
              id: "plugin-messaging-local",
              name: "Messaging",
              template_url: "https://chat.zuri.chat"
            }
          ]
        }
      });
      return;
    }

    const orgPluginsMatch = pathname.match(
      /^\/organizations\/([^/]+)\/plugins$/
    );

    if (req.method === "POST" && orgPluginsMatch) {
      const token = getAuthorizationToken(req);
      const user = findUserByToken(db, token);
      const workspace = db.organizations.find(
        org => org.id === orgPluginsMatch[1]
      );
      const body = await parseJsonBody(req);

      if (!user || !workspace) {
        notFound(res, "Workspace not found");
        return;
      }

      workspace.installedPlugins.push({
        plugin_id: body.plugin_id,
        user_id: body.user_id,
        installed_at: new Date().toISOString()
      });

      writeDb(db);

      sendJson(res, 200, {
        status: 200,
        data: {
          installed: true
        }
      });
      return;
    }

    if (req.method === "POST" && pathname === "/chat/install") {
      const body = await parseJsonBody(req);

      db.installs.push({
        id: randomUUID(),
        type: "chat",
        organization_id: body.organisation_id,
        user_id: body.user_id,
        created_at: new Date().toISOString()
      });

      writeDb(db);

      sendJson(res, 200, {
        status: 200,
        data: {
          installed: true
        }
      });
      return;
    }

    const inviteMatch = pathname.match(
      /^\/organizations\/([^/]+)\/send-invite$/
    );

    if (req.method === "POST" && inviteMatch) {
      const workspace = db.organizations.find(org => org.id === inviteMatch[1]);
      const body = await parseJsonBody(req);

      if (!workspace) {
        notFound(res, "Workspace not found");
        return;
      }

      sendJson(res, 200, {
        status: 200,
        data: {
          sent: Array.isArray(body.emails) ? body.emails.length : 0
        }
      });
      return;
    }

    notFound(res);
  } catch (error) {
    sendJson(res, 500, {
      status: 500,
      message: error.message || "Internal server error"
    });
  }
});

server.listen(PORT, () => {
  ensureDb();
  console.log(`Local Zuri API listening on http://localhost:${PORT}`);
  console.log(`Voice uploads: ${VOICE_UPLOAD_DIR}`);
});
