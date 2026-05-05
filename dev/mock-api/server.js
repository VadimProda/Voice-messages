const http = require("http");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const PORT = Number(process.env.MOCK_API_PORT || 5050);
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    const initialState = {
      users: [],
      organizations: [],
      installs: []
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialState, null, 2));
  }
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS"
  });
  res.end(JSON.stringify(payload));
}

function notFound(res, message = "Not found") {
  sendJson(res, 404, { status: 404, message });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", chunk => {
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
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

function getAuthorizationToken(req) {
  const header = req.headers.authorization || "";
  return header.replace(/^Bearer\s+/i, "").trim();
}

function findUserByToken(db, token) {
  if (!token) return null;
  return db.users.find(user => user.token === token) || null;
}

function sanitizeUser(user) {
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
    no_of_members: workspace.members.length,
    workspace_url: workspace.workspace_url
  };
}

function withCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
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
  const db = readDb();

  try {
    if (req.method === "GET" && pathname === "/health") {
      sendJson(res, 200, { status: 200, message: "ok" });
      return;
    }

    if (req.method === "POST" && pathname === "/users") {
      const body = await parseBody(req);
      const email = String(body.email || "").trim().toLowerCase();

      if (!email || !body.password || !body.first_name) {
        sendJson(res, 400, {
          status: 400,
          message: "Missing required signup fields"
        });
        return;
      }

      const existingUser = db.users.find(user => user.email === email);
      if (existingUser) {
        sendJson(res, 400, {
          status: 400,
          message: "User with email already exists"
        });
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
      const body = await parseBody(req);
      const code = String(body.code || "").trim();
      const user = db.users.find(item => item.verificationCode === code);

      if (!user) {
        sendJson(res, 400, { status: 400, message: "Invalid verification code" });
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
      const body = await parseBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const user = db.users.find(item => item.email === email);

      if (!user) {
        sendJson(res, 404, { status: 404, message: "User not found" });
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
        sendJson(res, 403, { status: 403, message: "Account not verified" });
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
      sendJson(res, 200, { status: 200, message: "Logged out" });
      return;
    }

    const userOrganizationsMatch = pathname.match(/^\/users\/([^/]+)\/organizations$/);
    if (req.method === "GET" && userOrganizationsMatch) {
      const email = decodeURIComponent(userOrganizationsMatch[1]).toLowerCase();
      const workspaces = db.organizations
        .filter(org => org.memberEmails.includes(email))
        .map(workspaceSummary);

      sendJson(res, 200, { status: 200, data: workspaces });
      return;
    }

    if (req.method === "POST" && pathname === "/organizations") {
      const token = getAuthorizationToken(req);
      const user = findUserByToken(db, token);
      const body = await parseBody(req);
      const creatorEmail = String(body.creator_email || user?.email || "").toLowerCase();

      if (!user || user.email !== creatorEmail) {
        sendJson(res, 401, { status: 401, message: "Unauthorized" });
        return;
      }

      const organizationId = `org-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
      const memberId = `member-${randomUUID().replace(/-/g, "").slice(0, 10)}`;
      const workspace = {
        id: organizationId,
        name: "New Workspace",
        workspace_url: `${organizationId}.localhost`,
        creator_email: creatorEmail,
        members: [
          {
            _id: memberId,
            email: creatorEmail
          }
        ],
        memberEmails: [creatorEmail],
        installedPlugins: []
      };

      db.organizations.push(workspace);
      writeDb(db);

      sendJson(res, 200, {
        status: 200,
        data: {
          organization_id: organizationId
        }
      });
      return;
    }

    const renameWorkspaceMatch = pathname.match(/^\/organizations\/([^/]+)\/name$/);
    if (req.method === "PATCH" && renameWorkspaceMatch) {
      const token = getAuthorizationToken(req);
      const user = findUserByToken(db, token);
      const workspace = db.organizations.find(org => org.id === renameWorkspaceMatch[1]);
      const body = await parseBody(req);

      if (!user || !workspace) {
        sendJson(res, 404, { status: 404, message: "Workspace not found" });
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

    const workspaceMembersMatch = pathname.match(/^\/organizations\/([^/]+)\/members\/?$/);
    if (req.method === "GET" && workspaceMembersMatch) {
      const workspace = db.organizations.find(org => org.id === workspaceMembersMatch[1]);
      if (!workspace) {
        sendJson(res, 404, { status: 404, message: "Workspace not found" });
        return;
      }

      const query = String(url.searchParams.get("query") || "").toLowerCase();
      const members = workspace.members.filter(member =>
        !query || member.email.toLowerCase().includes(query)
      );

      sendJson(res, 200, { status: 200, data: members });
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

    const orgPluginsMatch = pathname.match(/^\/organizations\/([^/]+)\/plugins$/);
    if (req.method === "POST" && orgPluginsMatch) {
      const token = getAuthorizationToken(req);
      const user = findUserByToken(db, token);
      const workspace = db.organizations.find(org => org.id === orgPluginsMatch[1]);
      const body = await parseBody(req);

      if (!user || !workspace) {
        sendJson(res, 404, { status: 404, message: "Workspace not found" });
        return;
      }

      workspace.installedPlugins.push({
        plugin_id: body.plugin_id,
        user_id: body.user_id
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
      const body = await parseBody(req);
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

    const inviteMatch = pathname.match(/^\/organizations\/([^/]+)\/send-invite$/);
    if (req.method === "POST" && inviteMatch) {
      const workspace = db.organizations.find(org => org.id === inviteMatch[1]);
      const body = await parseBody(req);

      if (!workspace) {
        sendJson(res, 404, { status: 404, message: "Workspace not found" });
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
  console.log(`Mock API listening on http://localhost:${PORT}`);
});
