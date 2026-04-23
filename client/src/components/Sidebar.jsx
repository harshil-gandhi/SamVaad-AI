import React, { useEffect, useRef, useState } from "react";
import { assets } from "../assets/assets";
import { useAppContext } from "../context/AppContext";
import moment from "moment";

const SIDEBAR_CHAT_TITLE_MAX_LENGTH = 22;

const isLikelyUrl = (value) => /^https?:\/\/\S+$/i.test(String(value || "").trim());

const formatSidebarChatTitle = (name) => {
  const safeName = String(name || "New Chat");

  if (safeName.length <= SIDEBAR_CHAT_TITLE_MAX_LENGTH) {
    return safeName;
  }

  return `${safeName.slice(0, SIDEBAR_CHAT_TITLE_MAX_LENGTH)}...`;
};

const getChatPreviewText = (chat) => {
  const messages = Array.isArray(chat?.messages) ? chat.messages : [];

  // Always use the first message preview (oldest in chat).
  const firstMessage = messages[0];
  if (firstMessage) {
    const content = String(firstMessage?.content || "").trim();
    const messageType = String(firstMessage?.messageType || "").toLowerCase();
    const isMediaMessage =
      Boolean(firstMessage?.isImage) ||
      ["image", "video", "audio", "file"].includes(messageType);

    if (isMediaMessage || isLikelyUrl(content)) {
      const fileName = String(firstMessage?.mediaFileName || "").trim();
      if (messageType === "file") return fileName ? `Uploaded file: ${fileName}` : "Uploaded file";
      if (messageType === "video") return "Uploaded video";
      if (messageType === "audio") return "Uploaded audio";
      return "Uploaded image";
    }

    if (content) return content;
  }

  return String(chat?.name || "New Chat");
};

const Sidebar = ({ isMenuOpen, setIsMenuOpen }) => {
  const { chats, theme, setTheme, user, navigate, setSelectedChat, createNewChat, logout, deleteChat, renameChat } =
    useAppContext();
  const [search, setSearch] = useState("");
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [editingChatId, setEditingChatId] = useState(null);
  const [renamedChatName, setRenamedChatName] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [mobileActionChatId, setMobileActionChatId] = useState(null);
  const sidebarRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const skipNextRowClickRef = useRef(false);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (!isMenuOpen) return;

    const handleClickOutside = (event) => {
      if (window.innerWidth >= 768) return;

      if (sidebarRef.current && !sidebarRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isMenuOpen, setIsMenuOpen]);

  const handleCreateChat = async () => {
    try {
      setIsCreatingChat(true);
      await createNewChat();
      navigate("/");
      setIsMenuOpen(false);
    } finally {
      setIsCreatingChat(false);
    }
  };

  const handleLogoutClick = async (event) => {
    event.stopPropagation();
    const shouldLogout = window.confirm("You are about to log out. Are you sure?");
    if (!shouldLogout) return;
    await logout();
  };

  const handleStartRename = (event, chat) => {
    event.stopPropagation();
    setEditingChatId(chat?._id || null);
    setRenamedChatName(String(chat?.name || "New Chat"));
    setMobileActionChatId(null);
  };

  const handleCancelRename = (event) => {
    event?.stopPropagation?.();
    setEditingChatId(null);
    setRenamedChatName("");
    setIsRenaming(false);
  };

  const handleSaveRename = async (event, chatId) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (isRenaming) return;

    const nextName = String(renamedChatName || "").trim();
    if (!nextName) return;

    try {
      setIsRenaming(true);
      const updated = await renameChat(chatId, nextName);
      if (updated) {
        setEditingChatId(null);
        setRenamedChatName("");
      }
    } finally {
      setIsRenaming(false);
    }
  };

  const handleDeleteChat = async (event, chatId) => {
    event.stopPropagation();
    setMobileActionChatId(null);
    await deleteChat(event, chatId);
  };

  const handleChatRowTouchStart = (event, chatId) => {
    if (window.innerWidth >= 768) return;

    skipNextRowClickRef.current = false;
    clearLongPressTimer();

    longPressTimerRef.current = setTimeout(() => {
      skipNextRowClickRef.current = true;
      setMobileActionChatId(chatId);
    }, 700);
  };

  const handleChatRowTouchEnd = () => {
    clearLongPressTimer();
  };

  useEffect(() => {
    return () => {
      clearLongPressTimer();
    };
  }, []);

  return (
    <div
      ref={sidebarRef}
      className={`flex flex-col h-screen min-w-72 p-4 dark:bg-gradient-to-b dark:from-[#242124]/30 dark:to-[#000000]/30 border-r border-[#80609F]/30 backdrop-blur-3xl transition-all duration-500 max-md:absolute left-0 z-1 ${!isMenuOpen && "max-md:-translate-x-full"}`}
    >
      {/* {logo} */}

      <img
        src={theme === "dark" ? assets.logo_full : assets.logo_full_dark}
        alt=""
        className="w-full max-w-48"
      />

      {/* {button} */}
      <button
        onClick={handleCreateChat}
        disabled={isCreatingChat}
        className="bg-gradient-to-r from-[#A456F7] to-[#3D81F6] hover:from-[#80609F]/50 hover:to-[#80609F]/70 py-2 mt-5 text-white rounded-full w-full h-10 flex items-center justify-center transition-all duration-300 text-sm cursor-pointer disabled:opacity-80 disabled:cursor-not-allowed"
      >
        <span className=" mr-2 text-xl">+</span> {isCreatingChat ? "Creating..." : "New Chat"}
      </button>

      {/* Search */}
      <div className="flex items-center gap-2 p-1 mt-3 border border-gray-400 rounded-md">
        <img
          src={assets.search_icon}
          alt="search"
          className="w-4 h-4 not-dark:invert"
        />
        <input
          type="text"
          placeholder="Search chats..."
          className="text-sm placeholder:text-gray-400 bg-transparent focus:outline-none w-full"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Recent Chats */}
      {chats.length > 0 && (
        <p className="text-xs text-grey-500 uppercase mt-4 mb-2">
          Recent Chats
        </p>
      )}

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto text-sm max-h-[calc(100vh-250px)] space-y-3 ">
        {chats
          .filter((chat) => {
            const messageText = getChatPreviewText(chat);
            const nameText = chat.name || "";

            return (
              messageText.toLowerCase().includes(search.toLowerCase()) ||
              nameText.toLowerCase().includes(search.toLowerCase())
            );
          })
          .map((chat) => {
            const previewText = getChatPreviewText(chat);
            const isEditingThisChat = editingChatId === chat._id;
            const isMobileActionsVisible = mobileActionChatId === chat._id;

            return (
            <div onClick={() => {
              if (skipNextRowClickRef.current) {
                skipNextRowClickRef.current = false;
                return;
              }
              setMobileActionChatId(null);
              navigate("/");
              setSelectedChat(chat);
              setIsMenuOpen(false);
            }}
            onTouchStart={(e) => handleChatRowTouchStart(e, chat._id)}
            onTouchEnd={handleChatRowTouchEnd}
            onTouchMove={handleChatRowTouchEnd}
            onTouchCancel={handleChatRowTouchEnd}
            key={chat._id}
              className="p-2 px-4 dark:bg-[#57317C]/10 border border-gray-300 dark:border-[#80609F]/15 rounded-md cursor-pointer flex justify-between items-center group"
            >
              <div className="flex flex-col w-full min-w-0">
                {isEditingThisChat ? (
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => handleSaveRename(e, chat._id)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="text"
                      value={renamedChatName}
                      onChange={(e) => setRenamedChatName(e.target.value)}
                      maxLength={60}
                      autoFocus
                      className="text-sm w-full bg-transparent border border-gray-400 dark:border-[#80609F]/30 rounded px-2 py-1 outline-none"
                    />
                    <button
                      type="submit"
                      className="text-xs px-2 py-1 rounded bg-green-600 text-white disabled:opacity-50"
                      disabled={isRenaming || !String(renamedChatName || "").trim()}
                    >
                      {isRenaming ? "..." : "✓"}
                    </button>
                    <button
                      type="button"
                      className="text-xs px-2 py-1 rounded bg-gray-500 text-white"
                      onClick={handleCancelRename}
                      disabled={isRenaming}
                    >
                      ✕
                    </button>
                  </form>
                ) : (
                  <p className="text-sm truncate max-w-full" title={chat?.name || "New Chat"}>
                    {formatSidebarChatTitle(chat?.name)}
                  </p>
                )}
                <p className="text-xs text-gray-500 dark:text-[#B1A6C0] truncate max-w-full">
                  {chat.updatedAt ? moment(chat.updatedAt).fromNow() : "No date"}
                </p>
              </div>

              {!isEditingThisChat && (
                <>
                  <div className="hidden md:group-hover:flex items-center gap-2 ml-2">
                    <button
                      type="button"
                      onClick={(e) => handleStartRename(e, chat)}
                      className="text-sm px-1 cursor-pointer not-dark:invert hover:scale-110 transition-all"
                      title="Rename chat"
                      aria-label="Rename chat"
                    >
                      ✎
                    </button>
                    <img onClick={(e) => handleDeleteChat(e, chat._id)}
                      src={assets.bin_icon}
                      alt="delete"
                      className="h-5 cursor-pointer not-dark:invert hover:scale-110 transition-all"
                    />
                  </div>

                  <div className={`${isMobileActionsVisible ? "flex" : "hidden"} md:hidden items-center gap-2 ml-2`}>
                    <button
                      type="button"
                      onClick={(e) => handleStartRename(e, chat)}
                      className="text-sm px-1 cursor-pointer not-dark:invert hover:scale-110 transition-all"
                      title="Rename chat"
                      aria-label="Rename chat"
                    >
                      ✎
                    </button>
                    <img onClick={(e) => handleDeleteChat(e, chat._id)}
                      src={assets.bin_icon}
                      alt="delete"
                      className="h-5 cursor-pointer not-dark:invert hover:scale-110 transition-all"
                    />
                  </div>
                </>
              )}
            </div>
            )
          })}
      </div>

      {/* {communityImages} */}

      <div
        onClick={() => {
          navigate("/community");
          setIsMenuOpen(false);
        }}
        className="flex items-center gap-2 mt-2 p-2 border border-gray-300 dark:border-white/15 rounded-md cursor-pointer hover:scale-103 transition-all "
      >
        <img
          src={assets.gallery_icon}
          alt="community images"
          className="w-4.5 not-dark:invert"
        />
        <div className="flex flex-col text-sm">
          <p>Community Images</p>
        </div>
      </div>

      {/* {credit purchaseOption} */}

      <div
        onClick={() => {
          navigate("/credit");
          setIsMenuOpen(false);
        }}
        className="flex items-center gap-2 mt-2 p-2 border border-gray-300 dark:border-white/15 rounded-md cursor-pointer hover:scale-103 transition-all "
      >
        <img
          src={assets.diamond_icon}
          alt="credits"
          className="w-4.5 dark:invert"
        />
        <div className="flex flex-col text-sm">
          <p>{String(user?.role || "").toLowerCase() === "admin" ? "Edit Packages" : `Credits:${user?.credits || 0}`}</p>
          <p className="text-xs text-grey-400">
            {String(user?.role || "").toLowerCase() === "admin"
              ? "Manage package plans"
              : "Payment option available after booking approval"}
          </p>
        </div>
      </div>

      {/* {dark mode toggle} */}

      <div className="flex items-center justify-between gap-2 mt-2 p-2 border border-gray-300 dark:border-white/15 rounded-md hover:scale-103 ">
        <div className="flex item-center gap-2 text-sm">
          <img
            src={assets.theme_icon}
            alt="theme"
            className="w-4 not-dark:invert"
          />
          <p>Dark mode</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only peer "
            checked={theme === "dark"}
            onChange={() => setTheme(theme === "dark" ? "light" : "dark")}
          />
          <div className="w-9 h-5 bg-gray-400 rounded-full peer-checked:bg-purple-600 transition-all"></div>
          <span className="absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform peer-checked:translate-x-4"></span>
        </label>
      </div>

      {/* {User Account} */}

      <div className="flex items-center gap-2 mt-2 p-1 border border-gray-300 dark:border-white/15 rounded-md cursor-pointer group hover:scale-103">
        <img
          src={assets.user_icon}
          alt="user account"
          className="w-7 rounded-full"
        />
        <p className="flex-1 text-sm text-black dark:text-white truncate">
          {user ? (user?.username || user?.name || user?.email || "User") : "Login Your Account"}
        </p>
        {user && (
          <img
            src={assets.logout_icon}
            alt="logout"
            className="h-5 cursor-pointer not-dark:invert group-hover:block pr-2 hover:scale-110 transition-all"
            onClick={handleLogoutClick}
            title="Log out (you will need to sign in again)"
            aria-label="Log out"
          />
        )}

      </div>
      <img
        src={assets.close_icon}
        alt="close"
        className="h-5 top-3 right-3 w-3 absolute cursor-pointer not-dark:invert group-hover:block md:hidden "
        onClick={() => setIsMenuOpen(false)}
      />
    </div>
  );
};

export default Sidebar;
