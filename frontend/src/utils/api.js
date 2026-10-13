import axios from "axios";

// Defensively strip a trailing slash - if VITE_API_URL is set as
// "https://xyz.onrender.com/" (trailing slash) instead of without one,
// this avoids ending up with a double-slash baseURL ("...com//api").
const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/+$/, "");

const api = axios.create({
  baseURL: `${API_URL}/api`,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("gp_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("gp_token");
      localStorage.removeItem("gp_user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;
