import { BASE_API_URL, deleteAllUtilitiesCache } from "@zuri/utilities";
import axios from "axios";
import { createContext, useContext, useEffect, useState } from "react";

const authContext = createContext();

const safeParseSessionJson = key => {
  const value = sessionStorage.getItem(key);

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    sessionStorage.removeItem(key);
    return null;
  }
};

const normalizeEmail = email =>
  String(email || "")
    .trim()
    .toLowerCase();

const persistAuthSession = ({ user, token, sessionId, organisations }) => {
  sessionStorage.setItem("token", token || "");
  sessionStorage.setItem("session_id", sessionId || "");
  sessionStorage.setItem("user", JSON.stringify(user || null));
  sessionStorage.setItem(
    "organisations",
    JSON.stringify(Array.isArray(organisations) ? organisations : [])
  );
};

// Provider component that wraps your app and makes auth object available
// to any child component that calls useAuth().
export function ProvideAuth({ children }) {
  const auth = useProvideAuth();

  return <authContext.Provider value={auth}>{children}</authContext.Provider>;
}

// Hook for child components to get the auth object and re-render when it changes.
export const useAuth = () => {
  return useContext(authContext);
};

// Provider hook that creates auth object and handles state.
function useProvideAuth() {
  const userFromStorage = safeParseSessionJson("user");
  const userTokenFromStorage = sessionStorage.getItem("token");

  const [user, setUser] = useState(
    userFromStorage && userTokenFromStorage ? userFromStorage : null
  );

  const handleSocialSetUser = socialUser => {
    setUser(socialUser);
  };

  const signin = async (email, password) => {
    const normalizedEmail = normalizeEmail(email);

    const response = await axios.post(`${BASE_API_URL}/auth/login`, {
      email: normalizedEmail,
      password
    });

    const { data } = response.data;
    const token = data.user?.token || "";

    const fetchUserWorkspacesResponse = await axios.get(
      `${BASE_API_URL}/users/${data.user.email}/organizations`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    const userWorkspaces = Array.isArray(fetchUserWorkspacesResponse.data?.data)
      ? fetchUserWorkspacesResponse.data.data
      : [];

    persistAuthSession({
      user: data.user,
      token,
      sessionId: data.session_id,
      organisations: userWorkspaces
    });

    setUser(data.user);

    return {
      ...data,
      userWorkspaces
    };
  };

  const sendSignupVerificationCode = async signupData => {
    const payload = {
      ...signupData,
      email: normalizeEmail(signupData.email)
    };

    const response = await axios.post(`${BASE_API_URL}/users`, payload);

    if (response.data.status === 400) {
      throw new Error(response.data.message);
    }

    return response.data.data;
  };

  const confirmSignupVerificationCode = async code => {
    const response = await axios.post(
      `${BASE_API_URL}/account/verify-account`,
      {
        code
      }
    );

    return response;
  };

  const signout = async token => {
    await deleteAllUtilitiesCache();

    const lastLocation = localStorage.getItem("lastLocation");

    localStorage.clear();

    if (lastLocation) {
      window.localStorage.setItem("lastLocation", lastLocation);
    }

    sessionStorage.clear();

    axios.post(
      `${BASE_API_URL}/auth/logout`,
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    setUser(null);

    return true;
  };

  const sendPasswordResetEmail = () => {
    return true;
  };

  const confirmPasswordReset = () => {
    return true;
  };

  useEffect(() => {
    const storedUser = safeParseSessionJson("user");
    const storedToken = sessionStorage.getItem("token");

    if (storedUser && storedToken) {
      setUser(storedUser);
    } else {
      setUser(null);
    }
  }, []);

  return {
    user,
    handleSocialSetUser,
    signin,
    sendSignupVerificationCode,
    confirmSignupVerificationCode,
    signout,
    sendPasswordResetEmail,
    confirmPasswordReset
  };
}
