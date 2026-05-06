import React from "react";
import axios from "axios";
import { useHistory } from "react-router-dom";
import { BASE_API_URL } from "@zuri/utilities";
import { GeneralLoading } from "../../../components";
import { useTranslation } from "react-i18next";

const getShortWorkspaceId = workspaceId => {
  if (!workspaceId || workspaceId.length < 8) {
    return workspaceId || "local";
  }

  return `${workspaceId.slice(4, 6)}${workspaceId.slice(
    6,
    8
  )}${workspaceId.slice(-3, -1)}`;
};

const updateWorkspaceTracker = workspaceId => {
  const shortId = getShortWorkspaceId(workspaceId);

  let urlsTracker = {
    workspaceIds: []
  };

  try {
    urlsTracker =
      JSON.parse(localStorage.getItem("urlsTracker")) || urlsTracker;
  } catch (error) {
    urlsTracker = {
      workspaceIds: []
    };
  }

  const exists = urlsTracker.workspaceIds.some(
    item => item.real_id === workspaceId
  );

  if (!exists) {
    urlsTracker.workspaceIds.push({
      real_id: workspaceId,
      short_id: shortId
    });
  }

  localStorage.setItem("urlsTracker", JSON.stringify(urlsTracker));

  return shortId;
};

export default function Index({ createWorkspaceData }) {
  const history = useHistory();
  const { t } = useTranslation();

  const isLocalApi =
    BASE_API_URL.includes("localhost") || BASE_API_URL.includes("127.0.0.1");

  const messagingInstallUrl = isLocalApi
    ? `${BASE_API_URL}/chat/install`
    : "https://chat.zuri.chat/api/v1/install";

  const user = JSON.parse(sessionStorage.getItem("user") || "null");

  if (!user) {
    history.push("/login");
  }

  if (
    !createWorkspaceData.workspaceName &&
    !createWorkspaceData.workspaceDefaultChannelName
  ) {
    history.push("/create-workspace");
  }

  const WorkspaceSetup = async () => {
    try {
      const createWorkspaceApiCall = await axios.post(
        `${BASE_API_URL}/organizations`,
        {
          creator_email: user.email,
          organization_name: createWorkspaceData.workspaceName,
          name: createWorkspaceData.workspaceName,
          default_channel_name:
            createWorkspaceData.workspaceDefaultChannelName || "all-dms"
        },
        {
          headers: {
            Authorization: `Bearer ${user.token}`
          }
        }
      );

      const workspaceId = createWorkspaceApiCall.data.data.organization_id;
      const defaultChannelId =
        createWorkspaceApiCall.data.data.default_channel_id || null;

      await axios.patch(
        `${BASE_API_URL}/organizations/${workspaceId}/name`,
        {
          organization_name: createWorkspaceData.workspaceName
        },
        {
          headers: {
            Authorization: `Bearer ${user.token}`
          }
        }
      );

      const getCreatorMemberIdApiCall = await axios.get(
        `${BASE_API_URL}/organizations/${workspaceId}/members/?query=${user.email}`
      );

      const creatorMemberId =
        getCreatorMemberIdApiCall.data.data[0]?._id ||
        getCreatorMemberIdApiCall.data.data[0]?.id ||
        user.id;

      const fetchPluginsFromMarketplaceApiCall = await axios.get(
        `${BASE_API_URL}/marketplace/plugins`
      );

      const messagingPluginId =
        fetchPluginsFromMarketplaceApiCall.data.data.plugins.find(plugin =>
          plugin.template_url.includes("chat.zuri.chat")
        )?.id || "plugin-messaging-local";

      await axios.post(
        `${BASE_API_URL}/organizations/${workspaceId}/plugins`,
        {
          plugin_id: messagingPluginId,
          user_id: creatorMemberId
        },
        {
          headers: {
            Authorization: `Bearer ${user.token}`
          }
        }
      );

      await axios.post(
        messagingInstallUrl,
        {
          organisation_id: workspaceId,
          user_id: creatorMemberId
        },
        {
          headers: {
            Authorization: `Bearer ${user.token}`
          }
        }
      );

      const organizationsResponse = await axios.get(
        `${BASE_API_URL}/users/${user.email}/organizations`,
        {
          headers: {
            Authorization: `Bearer ${user.token}`
          }
        }
      );

      const organizations = Array.isArray(organizationsResponse.data?.data)
        ? organizationsResponse.data.data
        : [];

      const shortId = updateWorkspaceTracker(workspaceId);

      localStorage.setItem("currentWorkspace", workspaceId);
      localStorage.setItem("currentWorkspaceShort", shortId);
      localStorage.setItem("orgName", createWorkspaceData.workspaceName);
      localStorage.setItem("currentPlugin", "plugin-chat");
      localStorage.setItem(
        "currentRoom",
        createWorkspaceData.workspaceDefaultChannelName || "all-dms"
      );

      if (defaultChannelId) {
        sessionStorage.setItem("currentRoom", defaultChannelId);
      }

      sessionStorage.setItem("organisations", JSON.stringify(organizations));

      history.push("/create-workspace/step-3");
    } catch (error) {
      console.error("Workspace setup failed:", error);

      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Unable to create workspace.";

      window.alert(message);
      history.push("/create-workspace");
    }
  };

  React.useEffect(() => {
    if (
      user &&
      createWorkspaceData.workspaceName &&
      createWorkspaceData.workspaceDefaultChannelName
    ) {
      WorkspaceSetup();
    }
  }, []);

  return <GeneralLoading text={t("Launching Zuri Chat")} />;
}
