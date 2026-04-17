'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { AlertCircle, AlertTriangle, Bell, Info } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'INFO' | 'WARNING' | 'ERROR';
  isRead: boolean;
  createdAt: string;
}

export default function NotificationsPage() {
  const { data: session, status } = useSession();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const hasCompanyContext = Boolean(session?.user?.companyId);
  const canAccess = hasCompanyContext && session?.user?.role !== 'SUPER_ADMIN';

  useEffect(() => {
    if (status === 'loading') return;

    if (!canAccess) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    let active = true;

    async function loadNotifications() {
      setLoading(true);
      try {
        const res = await fetch(`/api/notifications?take=100${showUnreadOnly ? '&unreadOnly=true' : ''}`);
        const data = await res.json();
        if (active) {
          setNotifications(Array.isArray(data) ? data : []);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadNotifications();

    return () => {
      active = false;
    };
  }, [status, canAccess, showUnreadOnly]);

  const markAllAsRead = async () => {
    await fetch('/api/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    setNotifications((prev) => prev.map((notification) => ({ ...notification, isRead: true })));
  };

  const markOneAsRead = async (id: string) => {
    await fetch('/api/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setNotifications((prev) => prev.map((notification) => (
      notification.id === id ? { ...notification, isRead: true } : notification
    )));
  };

  const getIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'ERROR':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'WARNING':
        return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      default:
        return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  if (!canAccess && status !== 'loading') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-8">
        <div className="rounded-3xl border border-rose-100 bg-rose-50 px-8 py-10 text-center">
          <h2 className="text-xl font-bold text-rose-700">Acceso denegado</h2>
          <p className="mt-2 text-sm text-rose-600">Las notificaciones operativas solo están disponibles dentro de una empresa activa.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Centro de Notificaciones</h1>
          <p className="text-sm text-slate-500">Historial de alertas operativas y eventos recientes.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowUnreadOnly(false)}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition ${!showUnreadOnly ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
          >
            Todas
          </button>
          <button
            onClick={() => setShowUnreadOnly(true)}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition ${showUnreadOnly ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
          >
            No leídas
          </button>
          <button
            onClick={() => void markAllAsRead()}
            className="rounded-xl bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100"
          >
            Marcar todas
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-100 bg-white shadow-sm">
        {loading ? (
          <div className="flex min-h-[280px] items-center justify-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Bell className="w-12 h-12 mx-auto mb-3 opacity-20" />
            No hay notificaciones para mostrar.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {notifications.map((notification) => (
              <button
                key={notification.id}
                onClick={() => {
                  if (!notification.isRead) {
                    void markOneAsRead(notification.id);
                  }
                }}
                className={`flex w-full gap-4 px-6 py-5 text-left transition hover:bg-slate-50 ${notification.isRead ? 'opacity-70' : 'bg-blue-50/20'}`}
              >
                <div className="shrink-0 pt-0.5">
                  {getIcon(notification.type)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-4">
                    <p className={`text-sm ${notification.isRead ? 'font-semibold text-slate-700' : 'font-bold text-slate-900'}`}>
                      {notification.title}
                    </p>
                    {!notification.isRead && (
                      <span className="mt-1 inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500" />
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{notification.message}</p>
                  <p className="mt-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                    {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true, locale: es })}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
