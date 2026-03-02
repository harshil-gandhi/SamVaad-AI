import React, { useEffect, useState } from 'react'
import { useAppContext } from '../context/AppContext';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';

const Login = ({ initialMode = "login" }) => {
    const [state, setState] = useState(initialMode);
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const { axios, setToken } = useAppContext();

    useEffect(() => {
        setState(initialMode);
    }, [initialMode]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const url= state === "login" ? "/api/v1/users/login" : "/api/v1/users/register";
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
                    toast.success(data.message || "Account created successfully. Please login.");
                    setState("login");
                    setPassword("");
                    return;
                }

                toast.error("Login succeeded but access token was not returned.");
            }
                else {  
                    toast.error(data.message || "Authentication failed");
                }
        } catch (error) {
            console.error("Login error:", error);
            toast.error(error?.response?.data?.message || "Authentication request failed");
        }
    };
    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 m-auto items-start p-8 py-12 w-80 sm:w-[352px] text-gray-500 rounded-lg shadow-xl border border-gray-200 bg-white ">
            <p className="text-2xl font-medium m-auto">
                <span className="text-purple-700">User</span> {state === "login" ? "Login" : "Sign Up"}
            </p>
            {state === "register" && (
                <div className="w-full">
                    <p>Username</p>
                    <input onChange={(e) => setUsername(e.target.value)} value={username} placeholder="type here" className="border border-gray-200 rounded w-full p-2 mt-1 outline-purple-700" type="text" required />
                </div>
            )}
            <div className="w-full ">
                <p>Email</p>
                <input onChange={(e) => setEmail(e.target.value)} value={email} placeholder="type here" className="border border-gray-200 rounded w-full p-2 mt-1 outline-purple-700" type="email" required />
            </div>
            <div className="w-full ">
                <p>Password</p>
                <input onChange={(e) => setPassword(e.target.value)} value={password} placeholder="type here" className="border border-gray-200 rounded w-full p-2 mt-1 outline-purple-700" type="password" required />
            </div>
            {state === "register" ? (
                <p>
                    Already have account? <Link to="/login" className="text-purple-700 cursor-pointer">click here</Link>
                </p>
            ) : (
                <p>
                    Create an account? <Link to="/signup" className="text-purple-700 cursor-pointer">click here</Link>
                </p>
            )}
            <button type='submit' className="bg-purple-700 hover:bg-purple-800 transition-all text-white w-full py-2 rounded-md cursor-pointer">
                {state === "register" ? "Create Account" : "Login"}
            </button>
        </form>
    );
};
export default Login
