import React from "react";
import axios from "axios";
import { useHistory } from "react-router-dom";
import { BASE_API_URL } from "@zuri/utilities";
import { useTranslation } from "react-i18next";

import { UserOrganisationsListing, GeneralLoading } from "../../../components";

const safeParseSessionJson = (key, fallback = null) => {
  const value = sessionStorage.getItem(key);

  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    sessionStorage.removeItem(key);
    return fallback;
  }
};

const EmptyWorkspaceState = ({ onCreateWorkspace }) => {
  return (
    <div
      style={{
        maxWidth: "520px",
        margin: "42px auto 0",
        padding: "28px",
        textAlign: "center",
        border: "1px solid rgba(0, 0, 0, 0.08)",
        borderRadius: "12px",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.06)",
        background: "#fff"
      }}
    >
      <h2
        style={{
          margin: "0 0 12px",
          color: "#1d1c1d",
          fontSize: "1.5rem"
        }}
      >
        No workspaces yet
      </h2>

      <p
        style={{
          margin: "0 0 22px",
          color: "#616061",
          lineHeight: 1.5
        }}
      >
        Create a workspace to continue to Zuri Chat and test voice messages in
        the local chat.
      </p>

      <button
        type="button"
        onClick={onCreateWorkspace}
        style={{
          border: "none",
          borderRadius: "6px",
          padding: "12px 18px",
          background: "#00b87c",
          color: "#fff",
          fontWeight: 700,
          cursor: "pointer"
        }}
      >
        Create workspace
      </button>
    </div>
  );
};

export default function Index() {
  const history = useHistory();
  const { t } = useTranslation();

  const user = safeParseSessionJson("user", null);
  const [organizations, setOrganizations] = React.useState(() =>
    safeParseSessionJson("organisations", null)
  );
  const [isLoading, setIsLoading] = React.useState(
    !Array.isArray(organizations)
  );
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!user) {
      history.push("/login");
      return;
    }

    if (Array.isArray(organizations)) {
      return;
    }

    const fetchOrganizations = async () => {
      setIsLoading(true);
      setError("");

      try {
        const result = await axios.get(
          `${BASE_API_URL}/users/${user.email}/organizations`,
          {
            headers: {
              Authorization: `Bearer ${user.token}`
            }
          }
        );

        const data = Array.isArray(result.data?.data) ? result.data.data : [];

        setOrganizations(data);
        sessionStorage.setItem("organisations", JSON.stringify(data));
      } catch (requestError) {
        const message =
          requestError?.response?.data?.message ||
          requestError?.message ||
          "Unable to load workspaces";

        setError(message);
        setOrganizations([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrganizations();
  }, [history, organizations, user]);

  const handleCreateWorkspace = () => {
    history.push("/create-workspace");
  };

  return (
    <div>
      <div style={{ paddingTop: "5em" }} />

      <h2 style={{ textAlign: "center" }}>{t("workspace_head")}</h2>

      <p
        style={{
          textAlign: "center",
          fontWeight: "300",
          fontSize: `${18 / 17}rem`
        }}
      >
        {t("workspace_paragraph_first")}?{" "}
        <span
          style={{
            color: "#00b87c",
            fontWeight: "450",
            cursor: "pointer"
          }}
          onClick={handleCreateWorkspace}
        >
          {t("workspace_span")}
        </span>
      </p>

      {error ? (
        <div
          style={{
            maxWidth: "520px",
            margin: "24px auto",
            padding: "12px 16px",
            borderRadius: "8px",
            background: "#fff5f5",
            color: "#b42318",
            textAlign: "center"
          }}
        >
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <GeneralLoading />
      ) : Array.isArray(organizations) && organizations.length > 0 ? (
        <UserOrganisationsListing user={user} organizations={organizations} />
      ) : (
        <EmptyWorkspaceState onCreateWorkspace={handleCreateWorkspace} />
      )}
    </div>
  );
}
