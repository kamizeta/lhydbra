

## Plan: Restaurar notificaciones de Telegram para el operador y todas las funciones

### Problema raíz

Hay 3 fallos encadenados que bloquean Telegram:

1. **`send-notification` rechaza llamadas con service_role**: Usa `getUser()` que retorna `null` con tokens de servicio → responde 401. Esto bloquea las alertas de trades ejecutados, SL/TP y reconciliación.

2. **Trigger `notify_position_change` en PostgreSQL**: Usa `current_setting('app.supabase_url')` que retorna `NULL` → la llamada HTTP nunca sale. Esto bloquea las alertas automáticas de cambios en posiciones.

3. **GitHub Actions `operator.yml`**: Llama al operador con `SUPABASE_ANON_KEY` pero el path `scheduled` requiere service_role → responde 403 y el operador no corre desde GitHub.

### Cambios a realizar

#### 1. Arreglar `send-notification` (Edge Function)
**Archivo**: `supabase/functions/send-notification/index.ts`

Detectar si el token es la service_role_key. Si lo es, saltar `getUser()` y confiar en el `user_id` del body. Lógica:
```
token === SUPABASE_SERVICE_ROLE_KEY → bypass auth, usar user_id del body
token es JWT de usuario → validar con getUser() como ahora
```

#### 2. Arreglar trigger `notify_position_change` (Migración SQL)
Reemplazar `current_setting('app.supabase_url')` y `current_setting('app.supabase_anon_key')` por URL directa y service_role_key del vault:
```sql
CREATE OR REPLACE FUNCTION public.notify_position_change()
  ...
  url := 'https://boccgfolfxhkcxflkrqz.supabase.co/functions/v1/notify-position-change',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets 
                                    WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1)
  ),
```

#### 3. Arreglar GitHub Actions workflow
**Archivo**: `.github/workflows/operator.yml`

Cambiar la llamada del operador para usar `SUPABASE_SERVICE_ROLE_KEY` en vez de `SUPABASE_ANON_KEY`:
```yaml
-H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}"
```

#### 4. Agregar resumen de Telegram en cada corrida del operador
**Archivo**: `supabase/functions/operator-mode/index.ts`

Al final de cada corrida (línea ~1090), agregar envío directo a Telegram con un resumen compacto incluyendo: señales generadas, trades ejecutados, PnL abierto, capital, posiciones abiertas. Esto funciona independientemente de `send-notification`.

### Archivos modificados
- `supabase/functions/send-notification/index.ts` — bypass auth para service_role
- `supabase/functions/operator-mode/index.ts` — resumen Telegram directo en cada corrida
- `.github/workflows/operator.yml` — usar service_role_key
- 1 migración SQL — arreglar trigger `notify_position_change`

### Resultado esperado
Después de estos cambios, recibirás en Telegram:
- Resumen en cada corrida del operador (cada 30 min desde GitHub Actions)
- Alertas de trades ejecutados, SL/TP, posiciones cerradas
- Alertas de cambios en posiciones (trigger de DB)
- Los resúmenes diarios de mañana y cierre (ya funcionan vía job-monitor)

