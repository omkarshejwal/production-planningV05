export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

/**
 * A helper function to make authenticated requests to our FastAPI backend.
 * All calls go through here so we have one place to manage headers and error handling.
 */
export const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
    const url = endpoint.startsWith("http") ? endpoint : `${API_BASE_URL}${endpoint}`;

    const headers = {
        "Content-Type": "application/json",
        ...(localStorage.getItem('authToken') ? { Authorization: `Bearer ${localStorage.getItem('authToken')}` } : {}),
        ...options.headers,
    };

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail || `API Request failed with status ${response.status}`);
    }

    const text = await response.text();
    if (!text) {
        return null;
    }
    return JSON.parse(text);
};
