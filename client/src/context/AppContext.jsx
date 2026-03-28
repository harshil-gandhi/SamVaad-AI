import { createContext, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { dummyUserData, dummyChats } from "../assets/assets";
import axios from "axios";
import toast from "react-hot-toast";
const AppContext = createContext();

const ACTIVE_CHAT_SESSION_KEY = "samvaad_active_chat_id";
const SESSION_BOOTSTRAPPED_KEY = "samvaad_chat_session_bootstrapped";

const getSessionValue = (key) => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

const setSessionValue = (key, value) => {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Ignore storage write errors.
  }
};

const removeSessionValue = (key) => {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Ignore storage remove errors.
  }
};

axios.defaults.baseURL = import.meta.env.VITE_SERVER_URL;
axios.defaults.withCredentials = true;

export const AppContextProvider = ({ children }) => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");
  const [token, setToken] = useState(localStorage.getItem("token") || null);
  const [loadingUser, setLoadingUser] = useState(true);

  const clearAuthState = () => {
    setToken(null);
    setUser(null);
    setChats([]);
    setSelectedChat(null);
    localStorage.removeItem("token");
    removeSessionValue(ACTIVE_CHAT_SESSION_KEY);
    removeSessionValue(SESSION_BOOTSTRAPPED_KEY);
  };

  const refreshAccessToken = async () => {
    const { data } = await axios.post("/api/v1/users/refresh-token", {});
    const newAccessToken = data?.data?.accessToken;

    if (!newAccessToken) {
      throw new Error("Access token missing in refresh response");
    }

    setToken(newAccessToken);
    localStorage.setItem("token", newAccessToken);
    return newAccessToken;
  };

  const fetchUser = async () => {
    try {
      const { data } = await axios.get("/api/v1/users/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (data.success) {
        setUser(data?.user || data?.data || null);
      } else {
        toast.error(data.message || "Failed to fetch user data");
      }
    } catch (error) {
      if (error?.response?.status === 401) {
        try {
          const refreshedToken = await refreshAccessToken();
          const { data } = await axios.get("/api/v1/users/me", {
            headers: { Authorization: `Bearer ${refreshedToken}` },
          });

          if (data.success) {
            setUser(data?.user || data?.data || null);
            return;
          }
          clearAuthState();
          return;
        } catch {
          // Expected when access/refresh token is expired or missing.
          // Keep login page clean by silently resetting local auth state.
          clearAuthState();
          return;
        }
      }

      toast.error(
        error.response?.data?.message ||
          "An error occurred while fetching user data",
      );
    } finally {
      setLoadingUser(false);
    }
  };
  const createNewChat = async () => {
    try {
      if (!user) {
        toast.error("You must be logged in to create a chat");
        navigate("/");
        return null;
      }

      const { data } = await axios.post("/api/v1/chats/create", {}, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (data?.success) {
        const createdChat = data?.data || data?.chat || null;

        if (createdChat?._id) {
          setChats((prevChats) => [
            createdChat,
            ...prevChats.filter((chat) => chat._id !== createdChat._id),
          ]);
          setSelectedChat(createdChat);
          setSessionValue(ACTIVE_CHAT_SESSION_KEY, createdChat._id);
        }

        return createdChat;
      }

      toast.error(data?.message || "Failed to create a new chat");
      return null;
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "An error occurred while creating a new chat",
      );
      return null;
    }
  };

  const logout = async () => {
    try {
      await axios.post(
        "/api/v1/users/logout",
        {},
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
    } catch {
      // Ignore API logout failure and proceed with local cleanup.
    } finally {
      clearAuthState();
      navigate("/login");
      toast.success("Logged out successfully");
    }
  };

  //delete chat 
  const deleteChat = async (e,chatId) => {
    try {
      e.stopPropagation(); // Prevent triggering chat selection
      const confirmDelete = window.confirm("Are you sure you want to delete this chat?");
      if (!confirmDelete) return;
      const { data } = await axios.delete(`/api/v1/chats/delete/${chatId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (data.success) {
        setChats((prevChats) => prevChats.filter((chat) => chat._id !== chatId));
        if (selectedChat?._id === chatId) {
          setSelectedChat(null);
          removeSessionValue(ACTIVE_CHAT_SESSION_KEY);
        }
        toast.success("Chat deleted successfully");

        // Best-effort refresh; do not mark deletion as failed if refresh fails.
        try {
          await fetchUsersChats();
        } catch {
          toast.error("Chat deleted, but failed to refresh chat list.");
        }
      }
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "An error occurred while deleting the chat",
      );
    }
  }


  const fetchUsersChats = async ({ forceNewForSession = false, preferredChatId = null } = {}) => {
    try {
      if (!user) {
        toast.error("You must be logged in to view your chats");
        navigate("/login");
        return;
      }
      const { data } = await axios.get("/api/v1/chats", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (data.success) {
        let chatsList = data?.chats || data?.data || [];

        if (forceNewForSession || chatsList.length === 0) {
          const createdChat = await createNewChat();
          if (createdChat?._id) {
            preferredChatId = createdChat._id;
          }

          const refreshResponse = await axios.get("/api/v1/chats", {
            headers: { Authorization: `Bearer ${token}` },
          });

          const refreshData = refreshResponse?.data;
          if (refreshData?.success) {
            chatsList = refreshData?.chats || refreshData?.data || chatsList;
          }
        }

        setChats(chatsList);

        if (chatsList.length === 0) {
          setSelectedChat(null);
          removeSessionValue(ACTIVE_CHAT_SESSION_KEY);
          return;
        }

        const persistedChatId = getSessionValue(ACTIVE_CHAT_SESSION_KEY);
        const currentSelectedChatId = selectedChat?._id;
        const targetChatId =
          preferredChatId || currentSelectedChatId || persistedChatId;

        const nextSelectedChat =
          chatsList.find((chat) => chat._id === targetChatId) || chatsList[0];

        setSelectedChat(nextSelectedChat);
        if (nextSelectedChat?._id) {
          setSessionValue(ACTIVE_CHAT_SESSION_KEY, nextSelectedChat._id);
        }
      } else {
        toast.error(data.message || "Failed to fetch chats");
      }
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "An error occurred while fetching chats",
      );
    }
  };

  useEffect(() => {
    if (user) {
      const isSessionBootstrapped = getSessionValue(SESSION_BOOTSTRAPPED_KEY) === "true";
      fetchUsersChats({ forceNewForSession: !isSessionBootstrapped });
      setSessionValue(SESSION_BOOTSTRAPPED_KEY, "true");
    } else {
      navigate("/login");
      setChats([]);
      setSelectedChat(null);
      removeSessionValue(ACTIVE_CHAT_SESSION_KEY);
      removeSessionValue(SESSION_BOOTSTRAPPED_KEY);
    }
  }, [user]);

  useEffect(() => {
    if (selectedChat?._id) {
      setSessionValue(ACTIVE_CHAT_SESSION_KEY, selectedChat._id);
    }
  }, [selectedChat]);

  useEffect(() => {
    if(token){
      fetchUser();
    }
    else{
      setUser(null);
      setLoadingUser(false);
    }
  }, [token]);

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  //here value object is required bcz in AppContext.Provider we can only pass single value
  const value = {
    navigate,
    user,
    setUser,
    chats,
    setChats,
    selectedChat,
    setSelectedChat,
    theme,
    setTheme,
    token,
    setToken,
    loadingUser,
    fetchUser,
    fetchUsersChats,
    refreshAccessToken,
    axios,
    createNewChat,
    logout,
    deleteChat
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => useContext(AppContext);
