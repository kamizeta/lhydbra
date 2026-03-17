import { useState, useRef, useEffect } from 'react';

import { Bell, Check, CheckCheck, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotifications, type Notification } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

const severityColors: Record<string, string> = {
  critical: 'bg-loss/20 border-loss/40 text-loss',
  warning: 'bg-warning/20 border-warning/40 text-warning',
  info: 'bg-primary/20 border-primary/40 text-primary',
};

const categoryIcons: Record<string, string> = {
  sl_tp: '🎯',
  risk: '🛡️',
  regime: '📊',
  signal: '💡',
  pnl: '💰',
  agent: '🤖',
  general: 'ℹ️',
};

export default function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const recent = notifications.slice(0, 20);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-1.5 text-muted-foreground hover:text-foreground transition-colors"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-loss text-[9px] font-bold text-white animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-2 top-14 md:absolute md:inset-x-auto md:right-0 md:top-full md:mt-2 md:w-96 max-h-[70vh] md:max-h-[500px] bg-card border border-border rounded-lg shadow-xl z-50 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-bold text-foreground">Notificaciones</span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-[10px] text-primary hover:underline font-mono flex items-center gap-1"
                >
                  <CheckCheck className="h-3 w-3" /> Leídas
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={() => { if (confirm('¿Eliminar todas?')) clearAll(); }}
                  className="text-[10px] text-loss hover:underline font-mono flex items-center gap-1"
                >
                  <Trash2 className="h-3 w-3" /> Borrar
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {recent.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-xs font-mono">
                Sin notificaciones
              </div>
            ) : (
              recent.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "px-4 py-3 border-b border-border/50 transition-colors hover:bg-accent/30",
                    !n.is_read && "bg-primary/5"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-sm mt-0.5">{categoryIcons[n.category] || '📌'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-xs font-bold truncate",
                          n.severity === 'critical' ? 'text-loss' : n.severity === 'warning' ? 'text-warning' : 'text-foreground'
                        )}>
                          {n.title}
                        </span>
                        {!n.is_read && (
                          <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                      <span className="text-[9px] text-muted-foreground/60 font-mono mt-1 block">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: es })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!n.is_read && (
                        <button onClick={() => markAsRead(n.id)} className="p-0.5 text-muted-foreground hover:text-primary transition-colors" title="Marcar como leída">
                          <Check className="h-3 w-3" />
                        </button>
                      )}
                      <button onClick={() => deleteNotification(n.id)} className="p-0.5 text-muted-foreground hover:text-loss transition-colors" title="Eliminar">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 20 && (
            <div className="px-4 py-2 border-t border-border text-center">
              <a href="/notifications" className="text-[10px] text-primary hover:underline font-mono">
                Ver todas ({notifications.length})
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
