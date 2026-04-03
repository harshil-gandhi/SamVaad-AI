import React, { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAppContext } from "../context/AppContext";

const Loading = () => {

  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { fetchUser, setIsFooterVisible } = useAppContext();

  useEffect(() => {
    setIsFooterVisible(false);

    const isPaymentReturnRoute = pathname.startsWith("/loading/payment-success") || pathname.startsWith("/loading/payment-cancelled");
    if (isPaymentReturnRoute) {
      return () => setIsFooterVisible(true);
    }

    const timer = setTimeout(() => {
      // Simulate loading completion after 8 seconds
      fetchUser(); // Fetch user data after loading
      navigate("/"); // Redirect to the home page
    }, 8000);
    return () => {
      clearTimeout(timer); // Cleanup the timer on component unmount
      setIsFooterVisible(true);
    };
  }, [pathname, fetchUser, navigate, setIsFooterVisible]);

  return (
    <div
      className="bg-gradient-to-b from-[#531B81] to-[#29184B] backdrop-opacity-60
    flex items-center justify-center h-screen w-screen text-white text-2xl"
    >
      <div className="w-10 h-10 rounded-full border-2 border-white border-t-transparent animate-spin"></div>
    </div>
  );
};

export default Loading;
