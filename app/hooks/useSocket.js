import { useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

/**
 * Custom hook for WebSocket connection
 */
export function useSocket(key) {
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = React.useState(false);
  const [clipboard, setClipboard] = React.useState('');
  const [error, setError] = React.useState(null);

  // Initialize socket connection
  useEffect(() => {
    socketRef.current = io(BACKEND_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
    });

    socketRef.current.on('connect', () => {
      setIsConnected(true);
      setError(null);
      
      // Join room when connected
      if (key) {
        socketRef.current.emit('join_room', { key });
      }
    });

    socketRef.current.on('disconnect', () => {
      setIsConnected(false);
    });

    socketRef.current.on('clipboard_loaded', (data) => {
      setClipboard(data.content || '');
    });

    socketRef.current.on('clipboard_updated', (data) => {
      setClipboard(data.content);
    });

    socketRef.current.on('clipboard_deleted', () => {
      setClipboard('');
      setError('Clipboard was deleted');
    });

    socketRef.current.on('error', (err) => {
      setError(err.message || 'Connection error');
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [key]);

  // Update clipboard on change
  const updateClipboard = useCallback((content) => {
    setClipboard(content);
    if (socketRef.current && key) {
      socketRef.current.emit('clipboard_update', { key, content });
    }
  }, [key]);

  return {
    clipboard,
    setClipboard: updateClipboard,
    isConnected,
    error,
    socket: socketRef.current,
  };
}
