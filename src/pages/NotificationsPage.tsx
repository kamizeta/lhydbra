import { useState } from 'react';
import { Bell, Check, CheckCheck, Trash2, Filter } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useNotifications } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

const categories = [
  { key: 'all', label: 'Todas' },
  { key: 'sl_tp', label: '🎯 SL/TP' },
  { key: 'risk', label: '🛡️ Riesgo' },
  { key: 'regime', label: '📊 Régimen' },
  { key: 'signal', label: '💡 Señales' },
  { key: 'pnl', label: '💰 PnL' },
  { key: 'agent', label: '🤖 Agentes' },
];

export default function NotificationsPage() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification, clearAll } = useNotifications();
  const [filter, setFilter] = useState('all');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const filtered = notifications.filter(n => {
    if (filter !== 'all' && n.category !== filter) return false;
    if (showUnreadOnly && n.is_read) return false;
    return true;
  });

  return (
    <div className="p-6 space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" />
            Centro de Notificaciones
          </h1>
          <p className="text-sm text-muted-foreground font-mono">
            {unreadCount} sin leer · {notifications.length} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary border border-primary/30 rounded-md hover:bg-primary/10 transition-colors"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Marcar todas como leídas
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={() => setConfirmClear(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-loss border border-loss/30 rounded-md hover:bg-loss/10 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" /> Limpiar todo
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {categories.map(cat => (
          <button
            key={cat.key}
            onClick={() => setFilter(cat.key)}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium transition-colors border",
              filter === cat.key
                ? "bg-primary/10 text-primary border-primary/30"
                : "text-muted-foreground border-border hover:bg-accent"
            )}
          >
            {cat.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={showUnreadOnly}
              onChange={(e) => setShowUnreadOnly(e.target.checked)}
              className="rounded border-border"
            />
            Solo sin leer
          </label>
        </div>
      </div>

      {/* Notifications list */}
      <div className="terminal-border rounded-lg divide-y divide-border/50">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm font-mono">
            <Bell className="h-8 w-8 mx-auto mb-3 opacity-30" />
            Sin notificaciones{filter !== 'all' ? ' en esta categoría' : ''}
          </div>
        ) : (
          filtered.map(n => (
            <div
              key={n.id}
              className={cn(
                "px-4 py-3 transition-colors hover:bg-accent/30",
                !n.is_read && "bg-primary/5"
              )}
            >
              <div className="flex items-start gap-3">
                <div className={cn(
                  "shrink-0 mt-1 w-2 h-2 rounded-full",
                  n.severity === 'critical' ? 'bg-loss' : n.severity === 'warning' ? 'bg-warning' : 'bg-primary',
                  !n.is_read && 'animate-pulse'
                )} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-sm font-bold",
                      n.severity === 'critical' ? 'text-loss' : n.severity === 'warning' ? 'text-warning' : 'text-foreground'
                    )}>
                      {n.title}
                    </span>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-accent text-muted-foreground">
                      {n.category}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{n.message}</p>
                  <span className="text-[10px] text-muted-foreground/60 font-mono mt-1 block">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: es })}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!n.is_read && (
                    <button onClick={() => markAsRead(n.id)} className="p-1 text-muted-foreground hover:text-primary transition-colors" title="Marcar como leída">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button onClick={() => deleteNotification(n.id)} className="p-1 text-muted-foreground hover:text-loss transition-colors" title="Eliminar">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar todas las notificaciones?</AlertDialogTitle>
            <AlertDialogDescription>Se borrarán todas las notificaciones. Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { clearAll(); setConfirmClear(false); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
