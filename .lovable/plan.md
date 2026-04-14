

## Diagnóstico: Por qué SL/TP falla intermitentemente

### Problema encontrado

Hay **dos sistemas compitiendo** para colocar órdenes de protección, sin coordinación:

1. **`alpaca-trade`** (al ejecutar): Coloca un **trailing stop** + TP inmediatamente después del fill (línea 388-400)
2. **`alpaca-sync` SL-Guardian** (cada 5 min): Intenta colocar un **OCO** (stop fijo + limit) para toda posición abierta

El caso de TSLA muestra exactamente el conflicto:
- `alpaca-trade` colocó un trailing stop exitosamente al fill
- 5 minutos después, SL-Guardian intenta colocar un OCO pero Alpaca rechaza con `"insufficient qty available for order (requested: 65, available: 0)"` porque los 65 shares ya están reservados por el trailing stop existente
- SL-Guardian busca órdenes tipo `stop` y `limit`, pero **no detecta órdenes tipo `trailing_stop`** — por eso cree que no hay protección

Adicionalmente, el Guardian cancela cualquier orden que encuentre y reenvía (línea 754-758), lo que puede causar ventanas sin protección.

### Plan de corrección

#### 1. SL-Guardian: Detectar trailing stops como protección válida
- Agregar `trailing_stop` al mapeo de órdenes existentes en el Guardian
- Si ya existe un `trailing_stop` para un símbolo, considerar la protección como activa y NO re-enviar

#### 2. SL-Guardian: Agregar flag `protection_confirmed` 
- Después de que `alpaca-trade` coloque protección exitosamente, marcar `protection_confirmed = true` en la tabla `orders`
- El Guardian debe verificar este flag antes de intentar re-enviar — si la orden ya tiene protección confirmada y hay órdenes activas en Alpaca, skip

#### 3. SL-Guardian: No cancelar + re-crear si los precios coinciden
- Actualmente las líneas 738-739 siempre evalúan como true (`!hasStopOrder || hasStopOrder` = siempre true), lo que significa que el Guardian **siempre** cancela y re-envía, incluso si ya todo está bien
- Fix: Solo actuar si realmente falta protección o hay mismatch de precios

#### 4. Ventana de protección: Agregar wait después de cancel
- Aumentar el delay post-cancel de 500ms a 1500ms para que Alpaca libere la qty antes de re-enviar

### Archivos a modificar
- `supabase/functions/alpaca-sync/index.ts` — SL-Guardian: detectar trailing_stop, corregir lógica de re-evaluación, aumentar delay
- `supabase/functions/alpaca-trade/index.ts` — Marcar `protection_confirmed` en orders después de colocar protección exitosa

### Detalle técnico

```text
Antes (buggy):
  alpaca-trade: coloca trailing_stop + TP al fill
  SL-Guardian: no reconoce trailing_stop → cree que falta SL
  SL-Guardian: cancela + re-envía OCO → falla por qty held
  Líneas 738-739: missingStop = hasSL && (!hasStopOrder || hasStopOrder) → siempre true

Después (fix):
  alpaca-trade: coloca trailing_stop + TP → marca protection_confirmed
  SL-Guardian: detecta trailing_stop como protección válida → skip
  SL-Guardian: solo actúa si realmente falta protección
  Delay post-cancel: 500ms → 1500ms
```

