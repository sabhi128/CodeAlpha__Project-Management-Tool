import { io } from 'socket.io-client';

// Change URL if deployed, or use default backend URL
const SOCKET_URL = import.meta.env.VITE_API_URL || (window.location.port === '5173' ? 'http://localhost:5000' : window.location.origin);

export const socket = io(SOCKET_URL, {
  autoConnect: false,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});
