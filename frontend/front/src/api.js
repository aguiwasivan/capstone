import axios from "axios";
import { notifyAnalyticsUpdated } from "./utils/analyticsRefresh";

const API_BASE_URL =
  process.env.REACT_APP_API_URL ||
  "http://127.0.0.1:8000/api/";

const api = axios.create({
  baseURL: API_BASE_URL,
});

let refreshPromise = null;

function clearSavedAuth() {
  localStorage.removeItem("access");
  localStorage.removeItem("refresh");
  localStorage.removeItem("user");
}

function parseJwt(token) {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

function isTokenExpired(token) {
  const payload = parseJwt(token);
  if (!payload?.exp) return false;
  return Date.now() >= (payload.exp - 30) * 1000;
}

async function refreshAccessToken() {
  const refresh = localStorage.getItem("refresh");

  if (!refresh) {
    clearSavedAuth();
    window.location.assign("/login");
    throw new Error("Missing refresh token.");
  }

  if (refreshPromise) return refreshPromise;

  refreshPromise = axios
    .post(`${API_BASE_URL}token/refresh/`, { refresh })
    .then((response) => {
      const nextAccess = response.data?.access;

      if (!nextAccess) {
        throw new Error("Refresh response did not include an access token.");
      }

      localStorage.setItem("access", nextAccess);
      return nextAccess;
    })
    .catch((error) => {
      clearSavedAuth();
      window.location.assign("/login");
      throw error;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

// Automatically attach JWT token to every request
api.interceptors.request.use(
  async (config) => {
    const publicEndpoints = ["login/", "register/", "token/refresh/"];
    const requestUrl = String(config.url || "");
    const isPublicEndpoint = publicEndpoints.some((endpoint) =>
      requestUrl.endsWith(endpoint)
    );

    if (isPublicEndpoint) {
      delete config.headers.Authorization;
      return config;
    }

    const token = localStorage.getItem("access");

    if (token) {
      const usableToken = isTokenExpired(token) ? await refreshAccessToken() : token;
      config.headers.Authorization = `Bearer ${usableToken}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Optional: logout user if token is invalid/expired
api.interceptors.response.use(
  (response) => {
    if (["post", "put", "patch", "delete"].includes(response.config?.method?.toLowerCase())) {
      notifyAnalyticsUpdated();
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const requestUrl = String(originalRequest?.url || "");
    const isRefreshRequest = requestUrl.endsWith("token/refresh/");

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isRefreshRequest) {
      originalRequest._retry = true;

      try {
        const nextAccess = await refreshAccessToken();
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${nextAccess}`;
        return api(originalRequest);
      } catch {
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
