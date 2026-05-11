import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import ToastContainer from './ToastContainer';

const ToastContext = createContext(null);

const DEFAULT_DURATION = 4000; // 4 seconds

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef(null);

  const addToast = useCallback((type, message, duration = DEFAULT_DURATION) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, message }]);
    setVisible(true);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }

    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => {
      const newToasts = prev.filter((toast) => toast.id !== id);
      if (newToasts.length === 0) {
        // 延迟隐藏，让动画完成
        setTimeout(() => setVisible(false), 200);
      }
      return newToasts;
    });
  }, []);

  const showSuccess = useCallback((message, duration) => addToast('success', message, duration), [addToast]);
  const showError = useCallback((message, duration) => addToast('error', message, duration), [addToast]);
  const showWarning = useCallback((message, duration) => addToast('warning', message, duration), [addToast]);
  const showInfo = useCallback((message, duration) => addToast('info', message, duration), [addToast]);

  return (
    <ToastContext.Provider value={{ showSuccess, showError, showWarning, showInfo, removeToast }}>
      {children}
      {/* 使用 CSS animation 替代 MUI Slide，避免 DOM 引用问题 */}
      <div
        style={{
          position: 'fixed',
          top: 80,
          right: 24,
          zIndex: 9999,
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(-20px)',
          transition: 'opacity 200ms, transform 200ms',
          pointerEvents: visible ? 'auto' : 'none',
        }}
      >
        {toasts.length > 0 && <ToastContainer toasts={toasts} removeToast={removeToast} />}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
