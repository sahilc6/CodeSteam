// client/src/context/authStore.js
import { create } from "zustand";
import axios from "axios";
import { getApiBaseUrl } from "../utils/runtimeConfig";

const API = getApiBaseUrl();

const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const useAuthStore = create((set) => ({
  user: null,
  token: localStorage.getItem("token"),
  loading: false,
  error: null,
  success: null,

  init: async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const { data } = await api.get("/api/auth/me");
      set({ user: data, token });
      localStorage.setItem("username", data.username);
    } catch {
      localStorage.removeItem("token");
      localStorage.removeItem("username");
      set({ token: null, user: null });
    }
  },

  login: async (email, password) => {
    set({ loading: true, error: null, success: null });
    try {
      const { data } = await api.post("/api/auth/login", { email, password });
      localStorage.setItem("token", data.token);
      localStorage.setItem("username", data.user.username);
      set({ user: data.user, token: data.token, loading: false });
      return true;
    } catch (err) {
      set({
        error: err.response?.data?.error || "Login failed",
        loading: false,
      });
      return false;
    }
  },

  register: async (username, email, password) => {
    set({ loading: true, error: null, success: null });
    try {
      const { data } = await api.post("/api/auth/register", {
        username,
        email,
        password,
      });
      set({
        loading: false,
        success:
          data.message || "Registration successful. Please verify your email.",
      });
      return true;
    } catch (err) {
      set({
        error: err.response?.data?.error || "Registration failed",
        loading: false,
      });
      return false;
    }
  },

  resendVerification: async (email) => {
    set({ loading: true, error: null, success: null });
    try {
      const { data } = await api.post("/api/auth/resend-verification", {
        email,
      });
      set({
        loading: false,
        success: data.message || "Verification email sent successfully",
      });
      return true;
    } catch (err) {
      set({
        error:
          err.response?.data?.error || "Could not resend verification email",
        loading: false,
      });
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    set({ user: null, token: null, error: null, success: null });
  },

  clearError: () => set({ error: null }),
  clearSuccess: () => set({ success: null }),
}));

export default useAuthStore;
