

## Problema

La barra de estado del Dashboard muestra "0/3 trades" porque la llamada al edge function `operator-mode` falla con 401 (token no válido o expirado). Cuando `operatorStatus` es `null`, se muestran valores por defecto (`?? 0` / `?? 3`).

Las posiciones SÍ se muestran (MSFT, NVDA) porque se cargan directamente de la base de datos, pero la información del operador (trades hoy, riesgo, etc.) viene del edge function que falla.

## Corrección

### 1. Hacer el Dashboard resiliente al fallo del operador

En `src/pages/Dashboard.tsx`:
- Mostrar el conteo de posiciones abiertas desde el estado local (`positions.length`) además de los trades del día
- Usar datos locales como fallback cuando `operatorStatus` es null

### 2. Corregir `useOperatorMode.ts` para reintentar

- Eliminar la verificación redundante de `getSession()` antes de `invoke` (el SDK lo hace automáticamente)
- Agregar un retry con delay de 1s si falla la primera vez (da tiempo a que el token se refresque)
- No mostrar error si el retry también falla, simplemente dejar `status` como null

### 3. Actualizar la barra de estado

Cambiar la línea 233 del Dashboard de:
```
{operatorStatus?.trades_today ?? 0}/{operatorStatus?.max_trades_per_day ?? 3} trades
```
A:
```
{positions.length} pos · {operatorStatus?.trades_today ?? 0}/{operatorStatus?.max_trades_per_day ?? settings.max_trades_per_day} trades
```

Esto asegura que el conteo de posiciones SIEMPRE se muestre correcto (viene de la DB directa), independientemente de si el edge function responde o no.

