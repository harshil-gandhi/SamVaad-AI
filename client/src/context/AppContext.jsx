import { createContext, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { dummyUserData, dummyChats } from "../assets/assets";
import axios from "axios";
import toast from "react-hot-toast";
const AppContext = createContext();

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
        return;
      }

      await axios.post("/api/v1/chats/create", {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "An error occurred while creating a new chat",
      );
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


  const fetchUsersChats = async () => {
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
        const chatsList = data?.chats || data?.data || [];
        setChats(chatsList);
        // If there are no chats, create a new one and fetch again to set it as selected
        if (chatsList.length === 0) {
         await createNewChat();
         return fetchUsersChats();  
        } 
        else{
          setSelectedChat(chatsList[0]);
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
      fetchUsersChats();
    } else {
      navigate("/login");
      setChats([]);
      setSelectedChat(null);
    }
  }, [user]);

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
