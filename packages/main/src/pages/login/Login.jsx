import React from "react";
import { useHistory, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import styles from "./Login.module.css";
import {
  AuthInputBox,
  AuthFormWrapper,
  GeneralLoading
} from "../../components";
import { useAuth } from "../../auth/use-auth";

const DEFAULT_POST_LOGIN_PATH = "/choose-workspace";

const PUBLIC_POST_LOGIN_BLOCKLIST = new Set([
  "/",
  "/login",
  "/signup",
  "/Signup",
  "/legal",
  "/terms",
  "/privacy",
  "/forgot-password",
  "/reset-password"
]);

const getSafePostLoginPath = () => {
  const lastLocation = window.localStorage.getItem("lastLocation");

  if (!lastLocation) {
    return DEFAULT_POST_LOGIN_PATH;
  }

  if (PUBLIC_POST_LOGIN_BLOCKLIST.has(lastLocation)) {
    return DEFAULT_POST_LOGIN_PATH;
  }

  if (
    lastLocation === "/choose-workspace" ||
    lastLocation === "/create-workspace" ||
    lastLocation.startsWith("/workspace/")
  ) {
    return lastLocation;
  }

  return DEFAULT_POST_LOGIN_PATH;
};

export default function Index() {
  const auth = useAuth();
  const { t } = useTranslation();
  const history = useHistory();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, seterror] = React.useState("");
  const [emailerror, setemailerror] = React.useState("");
  const [passworderror, setpassworderror] = React.useState("");
  const [rememberMe, setRememberMe] = React.useState("");
  const [Loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const userInfo = sessionStorage.getItem("user");
    const redirect = sessionStorage.getItem("workSpaceInviteRedirect");

    if (userInfo && redirect) {
      history.push(redirect);
    }
  }, [history]);

  const handleSubmit = async e => {
    e.preventDefault();

    setemailerror("");
    setpassworderror("");
    seterror("");

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setemailerror("Enter an email address");
      return;
    }

    if (!password) {
      setpassworderror("Enter a Password");
      return;
    }

    setLoading(true);

    try {
      const userData = await auth.signin(normalizedEmail, password);

      const userWorkspaces = Array.isArray(userData.userWorkspaces)
        ? userData.userWorkspaces
        : [];

      if (userWorkspaces.length > 0) {
        const redirectPath = getSafePostLoginPath();

        if (redirectPath === DEFAULT_POST_LOGIN_PATH) {
          window.localStorage.removeItem("lastLocation");
        }

        history.push(redirectPath);
        return;
      }

      window.localStorage.removeItem("lastLocation");
      history.push("/create-workspace");
    } catch (loginError) {
      const message =
        loginError?.response?.data?.message ||
        loginError?.message ||
        "Unable to log in. Please try again.";

      const normalizedMessage = message.toLowerCase();

      if (
        normalizedMessage.includes("not found") ||
        normalizedMessage.includes("email") ||
        normalizedMessage.includes("user")
      ) {
        setemailerror(
          "Sorry, this email is not registered, try again or click Create an Account."
        );
      } else if (
        normalizedMessage.includes("login credentials") ||
        normalizedMessage.includes("password")
      ) {
        setpassworderror(
          "Sorry, you have entered the wrong password. Try again or click Get help signing in."
        );
      }

      seterror(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main id={styles.authPageWrapper}>
      {Loading && <GeneralLoading text="Launching Zuri Chat" />}

      <section id={styles.authFormContainer}>
        <AuthFormWrapper
          header={t("LogInheader")}
          subHeader={t(
            "Login with the data you entered during your registration."
          )}
          googleHeader={t("Login with Google")}
          topLineText={t("topline_text")}
          submitButtonName={t("LoginsubmitButtonName")}
          disabled={!(email && password)}
          error={error}
          handleSubmit={handleSubmit}
          bottomLine={t("logInbottomLine")}
          bottomLink={t("logInbottomLink")}
          bottomLinkHref="Signup"
          setLoading={setLoading}
        >
          <AuthInputBox
            className={`${styles.inputElement}`}
            id="email"
            name={t("emailInputName")}
            type="email"
            placeholder="Johndoe@example.com"
            value={email}
            setValue={setEmail}
            error={emailerror}
          />

          <AuthInputBox
            className={`${styles.inputElement}`}
            id="password"
            name={t("passwordInputName")}
            type="password"
            placeholder={t("passwordInputPlaceHolder")}
            value={password}
            setValue={setPassword}
            error={passworderror}
          />

          <div className={`${styles.rememberMe}`}>
            <div className={`${styles.left}`}>
              <input
                className={`${styles.checkBox}`}
                name="RememberMe"
                type="checkbox"
                checked={Boolean(rememberMe)}
                onChange={() => {
                  setRememberMe(prev => !prev);
                }}
              />
              {t("rememberMe")}
            </div>

            <div className={`${styles.right}`}>
              <Link
                to="/reset-password"
                className={`${styles.resetPasswordLink}`}
              >
                {t("forgotPassword")}
              </Link>
              <span>Get help signing in</span>
            </div>
          </div>
        </AuthFormWrapper>
      </section>
    </main>
  );
}
