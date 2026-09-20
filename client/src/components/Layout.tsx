import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { http } from '../api/http';
import { io, Socket } from 'socket.io-client';
import { API } from '../api/http';

type AppNotification = {
  id: string;
  message: string;
  read: boolean;
  userId: string;
  taskId?: number | null;
  createdAt: string;
};

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  const [unread, setUnread] = useState(0);
  const [online, setOnline] = useState(0);

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  useEffect(() => {
    if (!user) return;

    // Load existing notifications
    setLoadingNotifications(true);

    http
      .get('/notifications')
      .then((r) => {
        const data = r.data.data;

        setNotifications(data.items || []);
        setUnread(data.unread || 0);
      })
      .catch((error) => {
        console.error('Failed to load notifications:', error);
      })
      .finally(() => {
        setLoadingNotifications(false);
      });

    // Connect to Socket.IO
    const s: Socket = io(API.replace('/api', ''), {
      auth: {
        token: (window as any).__accessToken,
      },
    });

    s.on('presence:update', (x) => {
      setOnline(x.count);
    });

    // Receive new notification in real time
    s.on('notification:new', (notification: AppNotification) => {
      setNotifications((current) => {
        // Prevent duplicate notifications
        if (current.some((item) => item.id === notification.id)) {
          return current;
        }

        return [notification, ...current];
      });

      setUnread((current) => current + 1);
    });

    return () => {
      s.disconnect();
    };
  }, [user]);

  async function markNotificationRead(id: string) {
    try {
      await http.patch(`/notifications/${id}/read`);

      setNotifications((current) =>
        current.map((notification) =>
          notification.id === id
            ? { ...notification, read: true }
            : notification
        )
      );

      setUnread((current) => Math.max(0, current - 1));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  }

  async function markAllNotificationsRead() {
    try {
      await http.patch('/notifications/read-all');

      setNotifications((current) =>
        current.map((notification) => ({
          ...notification,
          read: true,
        }))
      );

      setUnread(0);
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  }

  function formatNotificationTime(date: string) {
    const created = new Date(date);
    const now = new Date();

    const diff = Math.floor(
      (now.getTime() - created.getTime()) / 1000
    );

    if (diff < 60) {
      return 'Just now';
    }

    if (diff < 3600) {
      return `${Math.floor(diff / 60)} min ago`;
    }

    if (diff < 86400) {
      return `${Math.floor(diff / 3600)} hr ago`;
    }

    return created.toLocaleDateString();
  }

  return (
    <div className="app">
      <aside>
        <h2>Velozity</h2>

        <p className="muted">
          {user?.role.replace('_', ' ')}
        </p>

        <NavLink to="/dashboard">Dashboard</NavLink>

        <NavLink to="/tasks">Tasks</NavLink>

        <NavLink to="/activity">Activity</NavLink>

        {user?.role !== 'DEVELOPER' && (
          <NavLink to="/projects">Projects</NavLink>
        )}

        {user?.role === 'ADMIN' && (
          <NavLink to="/users">Users</NavLink>
        )}

        <button
          onClick={async () => {
            await logout();
            nav('/login');
          }}
        >
          Logout
        </button>
      </aside>

      <main>
        <header
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '24px',
            position: 'relative',
          }}
        >
          <span>Live users: {online}</span>

          {/* Notification button */}
          <button
            onClick={() =>
              setShowNotifications((current) => !current)
            }
            style={{
              position: 'relative',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '16px',
              color: 'inherit',
              padding: '8px',
            }}
            aria-label="Notifications"
          >
            🔔

            {unread > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '0',
                  right: '0',
                  minWidth: '18px',
                  height: '18px',
                  padding: '0 4px',
                  borderRadius: '999px',
                  background: '#e53935',
                  color: 'white',
                  fontSize: '11px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>

          {/* Notification dropdown */}
          {showNotifications && (
            <div
              style={{
                position: 'absolute',
                top: '48px',
                right: '0',
                width: '380px',
                maxHeight: '500px',
                background: '#f4f6fb',
                border: '1px solid #374151',
                borderRadius: '10px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
                zIndex: 1000,
                overflow: 'hidden',
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '14px 16px',
                  borderBottom: '1px solid #374151',
                }}
              >
                <strong>Notifications</strong>

                {unread > 0 && (
                  <button
                    onClick={markAllNotificationsRead}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#60a5fa',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    Mark all as read
                  </button>
                )}
              </div>

              {/* Notification list */}
              <div
                style={{
                  maxHeight: '430px',
                  overflowY: 'auto',
                }}
              >
                {loadingNotifications ? (
                  <div
                    style={{
                      padding: '25px',
                      textAlign: 'center',
                      color: '#9ca3af',
                    }}
                  >
                    Loading notifications...
                  </div>
                ) : notifications.length === 0 ? (
                  <div
                    style={{
                      padding: '30px 20px',
                      textAlign: 'center',
                      color: '#9ca3af',
                    }}
                  >
                    No notifications
                  </div>
                ) : (
                  notifications.map((notification) => (
                    <div
                      key={notification.id}
                      onClick={() => {
                        if (!notification.read) {
                          markNotificationRead(notification.id);
                        }
                      }}
                      style={{
                        padding: '14px 16px',
                        borderBottom: '1px solid #1f2937',
                        background: notification.read
                          ? 'transparent'
                          : '#1e293b',
                        cursor: notification.read
                          ? 'default'
                          : 'pointer',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          gap: '10px',
                          alignItems: 'flex-start',
                        }}
                      >
                        {!notification.read && (
                          <span
                            style={{
                              width: '7px',
                              height: '7px',
                              marginTop: '6px',
                              borderRadius: '50%',
                              background: '#3b82f6',
                              flexShrink: 0,
                            }}
                          />
                        )}

                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              fontSize: '14px',
                              lineHeight: '1.4',
                            }}
                          >
                            {notification.message}
                          </div>

                          <div
                            style={{
                              marginTop: '5px',
                              fontSize: '11px',
                              color: '#9ca3af',
                            }}
                          >
                            {formatNotificationTime(
                              notification.createdAt
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </header>

        {children}
      </main>
    </div>
  );
}