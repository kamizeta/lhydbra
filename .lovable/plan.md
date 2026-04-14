

## Diagnóstico: Por qué QQQ y MSFT no se cerraron en la app

### Causa raíz encontrada

La lógica de cierre en `alpaca-sync` (líneas 382-395) tiene **dos fallos críticos**:

1. **No valida el `side` de la orden**: Construye `closedSymbols` con TODAS las órdenes filled (entrada y salida). Si la orden de entrada más reciente sobreescribe la de salida en el Map, el sistema encuentra una orden pero no reconoce que fue un cierre.

2. **El Map sobreescribe con la última orden**: Si hay múltiples órdenes filled del mismo símbolo en 24h (por ejemplo, una de entrada y una de salida), solo guarda la última. Si la de entrada es posterior, se pierde la de salida.

3. **Si no encuentra una `closingOrder`**, la posición simplemente se queda como "open" **para siempre**, sin ningún fallback. La posición no existe en Alpaca pero la app la ignora.

### Plan de corrección

#### 1. Validar side de la orden de cierre (`alpaca-sync`)
- Al construir `closedSymbols`, filtrar solo órdenes cuyo `side` sea opuesto a la dirección local de la posición
- Priorizar la orden filled más reciente que sea de salida

#### 2. Fallback para posiciones huérfanas
- Si una posición local **no existe en Alpaca** y tampoco tiene una `closingOrder` válida, cerrarla con `close_price = avg_entry` y `pnl = 0` como "missing_in_broker"
- Esto evita posiciones zombi que nunca se cierran

#### 3. Unificar entorno paper/live desde user_settings
- Aunque hoy estás en paper y el hardcode coincide, preparar el sistema para cuando operes en live
- Leer `paper_trading` de `user_settings` en `PositionsPage.tsx`, `useDashboardData.ts` y `Dashboard.tsx`

#### 4. Cerrar QQQ y MSFT manualmente ahora
- Marcar las posiciones como cerradas en la DB con datos reales de Alpaca

### Archivos a modificar
- `supabase/functions/alpaca-sync/index.ts` — Lógica de cierre + fallback
- `src/pages/PositionsPage.tsx` — Usar `paper_trading` de settings
- `src/hooks/useDashboardData.ts` — Usar `paper_trading` de settings

### Detalle técnico

```text
Antes (buggy):
  closedOrders → Map por símbolo (sobreescribe, sin filtrar side)
  Si posición no en Alpaca Y no hay closingOrder → no hace nada (zombi)

Después (fix):
  closedOrders → filtrar por side opuesto a dirección local
  Si posición no en Alpaca Y no hay closingOrder → cerrar como "missing_in_broker"
  Todas las llamadas paper/live → leer de user_settings
```

