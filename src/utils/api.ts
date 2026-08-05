// Centralized API configuration for the React Frontend
// This points directly to the FastAPI server running locally

export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

/**
 * Example usage in a component:
 * 
 * import { API_BASE_URL } from '@/utils/api';
 * 
 * fetch(`${API_BASE_URL}/machines/`, {
 *   headers: {
 *     "x-user-role": "MANAGER"
 *   }
 * })
 */
