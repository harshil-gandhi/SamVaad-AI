import React from "react";
import Sidebar from "./components/Sidebar";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Login from "./pages/Login";
import Community from "./pages/Community";
import Credit from "./pages/Credit";
import Loading from "./pages/Loading";
import { assets } from "./assets/assets";
import { useState } from "react";
import ChatBox from "./components/ChatBox";
import "./assets/prism.css";
import { useAppContext } from "./context/AppContext";
import{Toaster} from "react-hot-toast"


const App = () => {
  const {user,loadingUser} =useAppContext();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { pathname } = useLocation();
  if (pathname === "/loading" || loadingUser) {
    return <Loading />;
  }


  return (
    <>
      <Toaster position="top-center" toastOptions={{duration: 2000}}/>
      {user && !isMenuOpen && (
        <img
          src={assets.menu_icon}
          alt="menu"
          className="h-5 top-3 left-3 w-8 h-8 absolute cursor-pointer not-dark:invert md:hidden "
          onClick={() => setIsMenuOpen(true)}
        />
      )}
      {user ?(    <div className="dark:bg-gradient-to-b from-[#242124] to-[#000000] dark:text-white">
        <div className="flex h-screen w-screen ">
          <Sidebar isMenuOpen={isMenuOpen} setIsMenuOpen={setIsMenuOpen} />
          <Routes>
            <Route path="/" element={<ChatBox />} />
            <Route path="/community" element={<Community />} />
            <Route path="/credit" element={<Credit />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="/signup" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>):(
        <div className="h-screen w-screen flex items-center justify-center bg-gradient-to-b from-[#242124] to-[#000000] ">
          <Routes>
            <Route path="/login" element={<Login initialMode="login" />} />
            <Route path="/signup" element={<Login initialMode="register" />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </div>
      )}
  
    </>
  );
};

export default App;
