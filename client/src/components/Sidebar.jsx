import React from "react";
import { assets } from "../assets/assets";
import { useAppContext } from "../context/AppContext";
import { useState } from "react";
import moment from "moment";

const Sidebar = ({ isMenuOpen, setIsMenuOpen }) => {
  const { chats, theme, setTheme, user, setUser, navigate, setSelectedChat } =
    useAppContext();
  const [search, setSearch] = useState("");
  return (
    <div
      className={`flex flex-col h-screen min-w-72 p-4 dark:bg-gradient-to-b dark:from-[#242124]/30 dark:to-[#000000]/30 border-r border-[#80609F]/30 backdrop-blur-3xl transition-all duration-500 max-md:absolute left-0 z-1 ${!isMenuOpen && "max-md:-translate-x-full"}`}
    >
      {/* {logo} */}

      <img
        src={theme === "dark" ? assets.logo_full : assets.logo_full_dark}
        alt=""
        className="w-full max-w-48"
      />

      {/* {button} */}
      <button className="bg-gradient-to-r from-[#A456F7] to-[#3D81F6] hover:from-[#80609F]/50 hover:to-[#80609F]/70  py-2 mt-5 text-white rounded-full w-full h-10 flex items-center justify-center transition-all duration-300 text-sm  cursor-pointer">
        <span className=" mr-2 text-xl">+</span> New Chat
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
            const messageText = chat.messages?.[0]?.content || "";
            const nameText = chat.name || "";

            return (
              messageText.toLowerCase().includes(search.toLowerCase()) ||
              nameText.toLowerCase().includes(search.toLowerCase())
            );
          })
          .map((chat) => (
            <div onClick={() => {navigate("/"); setSelectedChat(chat); setIsMenuOpen(false);}}
            key={chat._id}
              className="p-2 px-4 dark:bg-[#57317C]/10 border border-gray-300 dark:border-[#80609F]/15 rounded-md cursor-pointer flex justify-between items-center group"
            >
              <div className="flex flex-col w-full">
                <p className="text-sm truncate">
                  {chat.messages.length > 0
                    ? chat.messages[0].content.slice(0, 32)
                    : chat.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-[#B1A6C0]">
                  {chat.updatedAt
                    ? moment(chat.updatedAt).fromNow()
                    : "No date"}
                </p>
              </div>

              <img
                src={assets.bin_icon}
                alt="delete"
                className="hidden w-4 cursor-pointer group-hover:block not-dark:invert"
              />
            </div>
          ))}
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
          <p>Credits:{user?.credits || 0}</p>
          <p className="text-xs text-grey-400">
            Purchase credits to use Samvaad AI
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
        <p className="flex-1 text-sm dark:text-primary truncate">
          {user ? user?.name : "Login Your Account"}
        </p>
        {user && (
          <img
            src={assets.logout_icon}
            alt="logout"
            className="h-4 cursor-pointer not-dark:invert group-hover:block "
            onClick={() => {
              setUser(null);
              navigate("/login");
            }}
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
