

## Diagnóstico: R-Multiple faltante en el Journal

### Causa raíz

El trigger `handle_position_closed` calcula R-Multiple así:
```sql
v_stop_distance := ABS(NEW.avg_entry - NEW.stop_loss);
IF v_stop_distance > 0 THEN
  v_r_multiple := COALESCE(NEW.pnl, 0) / (v_stop_distance * NEW.quantity);
END IF;
```

**Problema**: Para UBER y ORCL, `stop_loss = avg_entry` en la tabla `positions` (resultado del bug de ghost orders), así que `v_stop_distance = 0` y R queda NULL.

**Datos verificados**:
| Symbol | avg_entry | stop_loss (positions) | stop_loss (signals) |
|--------|-----------|----------------------|---------------------|
| UBER   | 71.9556   | 71.9556 ❌ (= entry) | 71.9075 ✅          |
| ORCL   | 139.1006  | 139.1006 ❌ (= entry)| 144.3925 ✅         |

### Plan de corrección

#### 1. Mejorar trigger `handle_position_closed` con fallback a señal
Cuando `stop_loss = avg_entry` (inválido), buscar el `stop_loss` original de la tabla `signals` usando `NEW.signal_id`. Esto garantiza que el R se calcule siempre que exista una señal vinculada.

```sql
-- Pseudo-lógica del fix:
IF NEW.stop_loss IS NULL OR NEW.stop_loss = NEW.avg_entry THEN
  -- Fallback: usar stop_loss de la señal original
  SELECT s.stop_loss INTO v_signal_sl FROM signals s WHERE s.id = NEW.signal_id;
  v_stop_distance := ABS(NEW.avg_entry - v_signal_sl);
ELSE
  v_stop_distance := ABS(NEW.avg_entry - NEW.stop_loss);
END IF;
```

#### 2. Usar `ABS(quantity)` en el cálculo de R
Actualmente usa `NEW.quantity` directamente, pero para shorts la qty es negativa (-65 para TSLA), lo que invierte el signo del R. Fix: usar `ABS(NEW.quantity)`.

#### 3. Backfill R-multiples faltantes
Ejecutar un UPDATE para recalcular R en journal entries existentes donde `r_multiple IS NULL` pero hay datos suficientes (signal_id con stop_loss válido).

### Archivos a modificar
- **Migration SQL**: Recrear trigger `handle_position_closed` con fallback + ABS(qty)
- **Migration SQL**: Backfill R-multiples en `trade_journal` y `positions.actual_r_multiple`

