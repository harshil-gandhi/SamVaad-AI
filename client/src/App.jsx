import React, { useEffect, useRef } from "react";
import Sidebar from "./components/Sidebar";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import Login from "./pages/Login";
import Community from "./pages/Community";
import Credit from "./pages/Credit";
import Loading from "./pages/Loading";
import { assets } from "./assets/assets";
import { useState } from "react";
import ChatBox from "./components/ChatBox";
import Footer from "./components/footer";
import "./assets/prism.css";
import { useAppContext } from "./context/AppContext";
import { Toaster, toast } from "react-hot-toast"


const App = () => {
  const { user, loadingUser, axios, token, fetchUser, refreshAccessToken } = useAppContext();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const handledSessionRef = useRef("");

  useEffect(() => {
    let isCancelled = false;
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const handlePaymentReturn = async () => {
      if (pathname.startsWith("/loading/payment-cancelled")) {
        toast("Payment cancelled");
        return;
      }

      if (!pathname.startsWith("/loading/payment-success")) {
        return;
      }

      const sessionId = new URLSearchParams(search).get("session_id");
      if (!sessionId || handledSessionRef.current === sessionId) {
        return;
      }

      if (!token) {
        toast.error("Session expired. Please login again.");
        return;
      }

      handledSessionRef.current = sessionId;

      try {
        const maxAttempts = 12;
        let isPaid = false;
        let authToken = token;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          if (isCancelled) return;

          let data;
          try {
            const response = await axios.get("/api/v1/credits/verify-session", {
              params: { session_id: sessionId },
              headers: { Authorization: `Bearer ${authToken}` },
            });
            data = response.data;
          } catch (error) {
            const message = String(error?.response?.data?.message || "").toLowerCase();
            const isAuthExpired = error?.response?.status === 401 &&
              (message.includes("jwt expired") || message.includes("unauthorized"));

            if (isAuthExpired) {
              authToken = await refreshAccessToken();
              const retryResponse = await axios.get("/api/v1/credits/verify-session", {
                params: { session_id: sessionId },
                headers: { Authorization: `Bearer ${authToken}` },
              });
              data = retryResponse.data;
            } else {
              throw error;
            }
          }

          if (data?.success && data?.data?.isPaid) {
            isPaid = true;
            break;
          }

          if (attempt < maxAttempts) {
            await sleep(2000);
          }
        }

        if (isCancelled) return;

        await fetchUser();
        if (isPaid) {
          toast.success("Payment processed. Credits updated.");
          navigate("/");
        } else {
          toast("Payment is processing. Credits will update shortly.");
          navigate("/");
        }
      } catch (error) {
        if (!isCancelled) {
          toast.error(error.response?.data?.message || "Failed to verify payment");
          navigate("/");
        }
      }
    };

    handlePaymentReturn();

    return () => {
      isCancelled = true;
    };
  }, [pathname, search, axios, token, fetchUser, navigate, refreshAccessToken]);

  if (pathname.startsWith("/loading") || loadingUser) {
    return <Loading />;
  }


  return (
    <>
      <Toaster position="top-center" toastOptions={{duration: 2000}}/>
      {user && !isMenuOpen && (
        <img
          src={assets.menu_icon}
          alt="menu"
          className="h-5 top-3 left-3 w-8 absolute cursor-pointer not-dark:invert md:hidden "
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
      {user && <Footer />}

    </>
  );
};

export default App;
