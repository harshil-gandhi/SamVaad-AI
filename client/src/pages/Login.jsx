import React, { useEffect, useState } from "react";
import { useAppContext } from "../context/AppContext";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";

const REGISTER_PASSWORD_REGEX = /^[A-Za-z0-9_]{8,}$/;

const Login = ({ initialMode = "login" }) => {
  const [state, setState] = useState(initialMode);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { axios, setToken } = useAppContext();

  useEffect(() => {
    setState(initialMode);
  }, [initialMode]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (state === "register" && !REGISTER_PASSWORD_REGEX.test(String(password || ""))) {
      toast.error(
        "Password must be at least 8 characters and only use letters, numbers, and underscore (_)",
      );
      return;
    }

    const url =
      state === "login" ? "/api/v1/users/login" : "/api/v1/users/register";
    const loadingToastId = toast.loading(
      state === "login" ? "Logging you in..." : "Creating your account...",
    );

    setIsSubmitting(true);
    try {
      const { data } = await axios.post(url, { username, email, password });
      if (data.success) {
        const accessToken = data?.token || data?.data?.accessToken;

        if (accessToken) {
          setToken(accessToken);
          localStorage.setItem("token", accessToken);
          return;
        }

        if (state === "register") {
          toast.success(
            data.message || "Account created successfully. Please login.",
          );
          setState("login");
          setPassword("");
          return;
        }

        toast.error("Login succeeded but access token was not returned.");
      } else {
        toast.error(data.message || "Authentication failed");
      }
    } catch (error) {
      console.error("Login error:", error);
      toast.error(
        error?.response?.data?.message || "Authentication request failed",
      );
    } finally {
      toast.dismiss(loadingToastId);
      setIsSubmitting(false);
    }
  };
  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 m-auto items-start w-[92vw] max-w-[400px] max-h-[90vh] overflow-y-auto p-5 sm:p-8 py-8 sm:py-12 text-gray-500 rounded-lg shadow-xl border border-gray-200 bg-white"
    >
      <p className="text-2xl font-medium m-auto">
        <span className="text-purple-700">User</span>{" "}
        {state === "login" ? "Login" : "Sign Up"}
      </p>
      {state === "register" && (
        <div className="w-full">
          <p>Username</p>
          <input
            onChange={(e) => setUsername(e.target.value)}
            value={username}
            placeholder="type here"
            className="border border-gray-200 rounded w-full p-2 mt-1 outline-purple-700"
            type="text"
            required
          />
        </div>
      )}
      <div className="w-full ">
        <p>Email</p>
        <input
          onChange={(e) => setEmail(e.target.value)}
          value={email}
          placeholder="type here"
          className="border border-gray-200 rounded w-full p-2 mt-1 outline-purple-700"
          type="email"
          required
        />
      </div>
      <div className="w-full ">
        <p>Password</p>
        <div className="relative">
          <input
            onChange={(e) => setPassword(e.target.value)}
            value={password}
            placeholder="type here"
            className="border border-gray-200 rounded w-full p-2 mt-1 outline-purple-700 pr-10"
            type={showPassword ? "text" : "password"}
            minLength={state === "register" ? 8 : undefined}
            pattern={state === "register" ? "[A-Za-z0-9_]{8,}" : undefined}
            title={
              state === "register"
                ? "Minimum 8 characters. Only letters, numbers, and underscore (_) allowed."
                : undefined
            }
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 mt-1"
            title={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ) : (
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path d="M3 3l18 18" />
                <path d="M10.58 10.58a2 2 0 002.83 2.83" />
                <path d="M9.88 5.08A10.94 10.94 0 0112 5c7 0 11 7 11 7a21.8 21.8 0 01-5.17 5.94" />
                <path d="M6.1 6.1A21.8 21.8 0 001 12s4 7 11 7c1.61 0 3.09-.33 4.38-.92" />
              </svg>
            )}{" "}
          </button>
        </div>
      </div>
      {state === "register" ? (
        <p>
          <span className="block text-xs text-gray-500 mb-1">
            Password rule: minimum 8 chars, only letters, numbers, and underscore (_)
          </span>
          Already have account?{" "}
          <Link to="/login" className="text-purple-700 cursor-pointer">
            click here
          </Link>
        </p>
      ) : (
        <p>
          Create an account?{" "}
          <Link to="/signup" className="text-purple-700 cursor-pointer">
            click here
          </Link>
        </p>
      )}
      <button
        type="submit"
        disabled={isSubmitting}
        className={`w-full py-2 rounded-md transition-all text-white ${
          isSubmitting
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-purple-700 hover:bg-purple-800 cursor-pointer"
        }`}
      >
        {isSubmitting
          ? state === "register"
            ? "Creating..."
            : "Logging in..."
          : state === "register"
            ? "Create Account"
            : "Login"}
      </button>
    </form>
  );
};
export default Login;
