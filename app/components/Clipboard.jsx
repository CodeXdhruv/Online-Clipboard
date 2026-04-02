'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * Generate a shorter, user-friendly clipboard key (5-6 letters)
 */
function generateKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let key = '';
  const length = Math.random() > 0.5 ? 6 : 5;
  for (let i = 0; i < length; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

/**
 * Convert file to base64
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

/**
 * Clipboard component - main UI
 */
export default function Clipboard() {
  const [mode, setMode] = useState(null); // 'create' or 'join'
  const [key, setKey] = useState('');
  const [inputKey, setInputKey] = useState('');
  const [content, setContent] = useState('');
  const [files, setFiles] = useState([]); // Array of {id, name, type, size, data}
  const [isConnected, setIsConnected] = useState(false);
  const [socket, setSocket] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [activeTab, setActiveTab] = useState('text'); // 'text' or 'files'
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const dragDropRef = useRef(null);

  // Handle Create new clipboard
  const handleCreateClipboard = useCallback((e) => {
    e?.preventDefault();
    const newKey = generateKey();
    setKey(newKey);
    setMode('create');
    setError('');
    setStatus('Connecting...');
  }, []);

  // Handle Join existing clipboard
  const handleJoinClipboard = useCallback((e) => {
    e?.preventDefault();
    
    if (!inputKey.trim()) {
      setError('Key is required');
      return;
    }

    setKey(inputKey.toUpperCase());
    setMode('join');
    setError('');
    setStatus('Connecting...');
  }, [inputKey]);

  // Socket connection effect
  useEffect(() => {
    if (!key || !mode) return;

    console.log('Connecting to:', BACKEND_URL);
    const newSocket = io(BACKEND_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
      transports: ['websocket', 'polling'],
      maxPayload: 100 * 1024 * 1024, // 100MB
    });

    newSocket.on('connect', () => {
      console.log('Socket connected:', newSocket.id);
      setIsConnected(true);
      setError('');
      setStatus('Connected');
      newSocket.emit('join_room', { key });
    });

    newSocket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      setError(`Connection failed: ${error.message}`);
      setStatus('Error');
    });

    newSocket.on('disconnect', () => {
      console.log('Socket disconnected');
      setIsConnected(false);
      setStatus('Disconnected');
    });

    newSocket.on('clipboard_loaded', (data) => {
      console.log('Clipboard loaded:', data);
      setContent(data.content || '');
      setFiles(data.files || []);
      setStatus('Loaded');
    });

    newSocket.on('clipboard_updated', (data) => {
      console.log('Clipboard updated:', data);
      setContent(data.content);
    });

    newSocket.on('file_uploaded', (data) => {
      console.log('File received:', data);
      setFiles(prev => {
        const existing = prev.find(f => f.id === data.id);
        if (existing) return prev;
        return [...prev, data];
      });
      setStatus('File received!');
      setTimeout(() => setStatus(''), 2000);
    });

    newSocket.on('files_list', (data) => {
      console.log('Files list:', data);
      setFiles(data.files || []);
    });

    newSocket.on('file_deleted', (data) => {
      setFiles(prev => prev.filter(f => f.id !== data.fileId));
      setStatus('File deleted');
    });

    newSocket.on('clipboard_deleted', () => {
      setContent('');
      setFiles([]);
      setError('Clipboard was deleted');
      setStatus('Deleted');
    });

    newSocket.on('error', (err) => {
      console.error('Socket error:', err);
      setError(err.message || 'Connection error');
      setStatus('Error');
    });

    setSocket(newSocket);

    return () => {
      if (newSocket) {
        newSocket.disconnect();
      }
    };
  }, [key, mode]);

  // Handle content change with debounce
  const handleContentChange = useCallback((e) => {
    const newContent = e.target.value;
    setContent(newContent);

    const timeoutId = setTimeout(() => {
      if (socket && key && isConnected) {
        socket.emit('clipboard_update', { key, content: newContent });
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [socket, key, isConnected]);

  // Handle file upload
  const handleFileUpload = useCallback(async (fileList) => {
    if (!socket || !key || !isConnected) {
      setError('Not connected');
      return;
    }

    const filesToUpload = Array.from(fileList).filter(file => {
      if (file.size > MAX_FILE_SIZE) {
        setError(`File ${file.name} is too large (max 50MB)`);
        return false;
      }
      const validTypes = ['image/', 'video/'];
      if (!validTypes.some(type => file.type.startsWith(type))) {
        setError(`File ${file.name} must be an image or video`);
        return false;
      }
      return true;
    });

    for (let i = 0; i < filesToUpload.length; i++) {
      const file = filesToUpload[i];
      setStatus(`Uploading ${file.name}...`);
      setUploadProgress(Math.round((i / filesToUpload.length) * 100));

      try {
        const base64 = await fileToBase64(file);
        const fileId = `${Date.now()}-${Math.random()}`;
        
        socket.emit('file_upload', {
          key,
          fileId,
          name: file.name,
          type: file.type,
          size: file.size,
          data: base64,
        });
      } catch (err) {
        setError(`Failed to upload ${file.name}`);
        console.error(err);
      }
    }

    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setStatus('Upload complete!');
    setTimeout(() => setStatus(''), 2000);
  }, [socket, key, isConnected]);

  // Handle drag and drop
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragDropRef.current) {
      dragDropRef.current.classList.add('border-black', 'bg-gray-100');
    }
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragDropRef.current) {
      dragDropRef.current.classList.remove('border-black', 'bg-gray-100');
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragDropRef.current) {
      dragDropRef.current.classList.remove('border-black', 'bg-gray-100');
    }
    handleFileUpload(e.dataTransfer.files);
  }, [handleFileUpload]);

  // Delete file
  const handleDeleteFile = useCallback((fileId) => {
    if (socket && key && isConnected) {
      socket.emit('file_delete', { key, fileId });
    }
  }, [socket, key, isConnected]);

  // Copy to clipboard
  const handleCopy = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.select();
      document.execCommand('copy');
      setStatus('Copied!');
      setTimeout(() => setStatus(''), 2000);
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (socket && key && isConnected) {
          socket.emit('clipboard_update', { key, content });
          setStatus('Saved');
          setTimeout(() => setStatus(''), 2000);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [socket, key, isConnected, content]);

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const getFileIcon = (type) => {
    if (type.startsWith('image/')) return '🖼️';
    if (type.startsWith('video/')) return '🎬';
    return '📄';
  };

  return (
    <div className="min-h-screen bg-white text-black font-sans">
      {/* Header */}
      <header className="border-b border-black p-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">CLIPBOARD</h1>
            <p className="text-sm text-gray-700 mt-1">SHARED • INSTANT • ZERO-AUTH</p>
          </div>
          <div className={`px-3 py-2 text-xs font-mono ${isConnected ? 'bg-black text-white' : 'bg-white text-black border border-black'}`}>
            {isConnected ? '● Connected' : '○ Disconnected'}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6">
        {/* Mode Selection */}
        {!mode ? (
          <section className="mb-8 space-y-6">
            <div className="text-center mb-12">
              <h2 className="text-2xl font-bold mb-2">SHARE YOUR CLIPBOARD</h2>
              <p className="text-sm text-gray-600">Text, images, and videos</p>
            </div>

            {/* Create Mode Button */}
            <button
              onClick={handleCreateClipboard}
              className="w-full border border-black p-8 hover:bg-black hover:text-white transition-colors"
            >
              <div className="text-left">
                <p className="text-lg font-bold mb-2">CREATE NEW CLIPBOARD</p>
                <p className="text-sm text-gray-600">Generate a unique key and share it with others</p>
              </div>
            </button>

            {/* Join Mode Button */}
            <button
              onClick={() => setMode('join')}
              className="w-full border border-black p-8 hover:bg-black hover:text-white transition-colors"
            >
              <div className="text-left">
                <p className="text-lg font-bold mb-2">JOIN EXISTING CLIPBOARD</p>
                <p className="text-sm text-gray-600">Paste a key to access shared content</p>
              </div>
            </button>
          </section>
        ) : (
          <>
            {/* Key Display */}
            <div className="border border-black mb-6">
              <div className="bg-black text-white px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-mono mb-2">CLIPBOARD KEY</p>
                  <p className="text-2xl font-bold font-mono">{key}</p>
                </div>
                <div className="text-right">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(key);
                      setStatus('Key copied!');
                      setTimeout(() => setStatus(''), 2000);
                    }}
                    className="bg-white text-black px-4 py-2 font-bold text-xs hover:bg-gray-200 mb-2 block"
                  >
                    COPY KEY
                  </button>
                  <button
                    onClick={() => {
                      setMode(null);
                      setKey('');
                      setContent('');
                      setFiles([]);
                      setInputKey('');
                      setIsConnected(false);
                    }}
                    className="bg-white text-black px-4 py-2 font-bold text-xs hover:bg-gray-200"
                  >
                    DISCONNECT
                  </button>
                </div>
              </div>
            </div>

            {/* Status */}
            <div className="border border-black mb-6">
              <div className="bg-gray-50 border-black px-6 py-3 flex items-center justify-between">
                <p className="text-xs font-bold">STATUS</p>
                <p className="text-xs font-mono">{isConnected ? '✓ Connected' : '⊗ ' + (status || 'Connecting...')}</p>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-0 mb-6 border border-black">
              <button
                onClick={() => setActiveTab('text')}
                className={`flex-1 px-6 py-3 font-bold text-xs border-r border-black transition-colors ${
                  activeTab === 'text' ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-50'
                }`}
              >
                TEXT
              </button>
              <button
                onClick={() => setActiveTab('files')}
                className={`flex-1 px-6 py-3 font-bold text-xs transition-colors ${
                  activeTab === 'files' ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-50'
                }`}
              >
                FILES ({files.length})
              </button>
            </div>

            {/* Text Tab */}
            {activeTab === 'text' && (
              <section className="border border-black mb-6">
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={handleContentChange}
                  className="w-full h-80 p-6 font-mono text-sm bg-white text-black border-none resize-none focus:outline-none"
                  placeholder="Type or paste your content here..."
                  spellCheck="false"
                />
                <div className="bg-gray-50 border-t border-black px-6 py-3 flex items-center justify-between">
                  <p className="text-xs text-gray-600">
                    {content.length} {content.length === 1 ? 'CHAR' : 'CHARS'}
                  </p>
                  <button
                    onClick={handleCopy}
                    className="bg-black text-white px-4 py-2 font-bold text-xs hover:bg-gray-800"
                  >
                    COPY
                  </button>
                </div>
              </section>
            )}

            {/* Files Tab */}
            {activeTab === 'files' && (
              <section className="border border-black mb-6">
                {/* Drop Zone */}
                <div
                  ref={dragDropRef}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className="border-2 border-dashed border-gray-300 p-8 text-center cursor-pointer bg-white transition-colors"
                >
                  <p className="text-sm font-bold mb-4">DRAG & DROP FILES HERE</p>
                  <p className="text-xs text-gray-600 mb-4">or click to select</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,video/*"
                    onChange={(e) => handleFileUpload(e.target.files)}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-black text-white px-6 py-2 font-bold text-xs hover:bg-gray-800"
                  >
                    SELECT FILES
                  </button>
                  <p className="text-xs text-gray-500 mt-4">Max 50MB per file • Images & videos only</p>
                </div>

                {/* Upload Progress */}
                {uploadProgress > 0 && (
                  <div className="border-t border-black p-4 bg-gray-50">
                    <p className="text-xs font-bold mb-2">UPLOADING: {uploadProgress}%</p>
                    <div className="w-full bg-gray-300 h-2">
                      <div
                        className="bg-black h-2 transition-all"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Files List */}
                <div className="border-t border-black">
                  {files.length === 0 ? (
                    <div className="p-6 text-center text-gray-600 text-xs">
                      No files shared yet
                    </div>
                  ) : (
                    <div className="divide-y divide-black">
                      {files.map((file) => (
                        <div key={file.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                          <div className="flex-1">
                            <p className="text-sm font-mono break-all">{file.name}</p>
                            <p className="text-xs text-gray-600 mt-1">
                              {getFileIcon(file.type)} {file.type} • {formatFileSize(file.size)}
                            </p>
                          </div>
                          <div className="flex gap-2 ml-4">
                            <a
                              href={file.data}
                              download={file.name}
                              className="bg-black text-white px-3 py-1 font-bold text-xs hover:bg-gray-800"
                            >
                              ↓
                            </a>
                            {mode === 'create' && (
                              <button
                                onClick={() => handleDeleteFile(file.id)}
                                className="bg-red-700 text-white px-3 py-1 font-bold text-xs hover:bg-red-900"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}

            {error && (
              <div className="border border-red-700 bg-white p-4 mb-4">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t border-black text-xs text-gray-600">
          <p className="font-mono">ONLINE CLIPBOARD • INSTANT SYNC • ZERO SETUP</p>
          <p className="mt-2">Share text, images, and videos in real-time</p>
        </footer>
      </main>
    </div>
  );
}
