

## Problema: Señales no se persisten en la base de datos

### Diagnóstico

Las órdenes de hoy (TSLA SHORT, GOOGL SHORT) tienen `signal_id = NULL` en la tabla `orders`, y **no existen señales de hoy en la tabla `signals`**.

**Causa raíz**: El `signal-engine` genera `signal_key` como `userId|TSLA|short|1d|2026-04-15`. Si ya existía una señal anterior con el mismo key (ej. del primer TSLA SHORT a las 14:53), el upsert con `ignoreDuplicates: true` **descarta silenciosamente** la segunda señal (la de las 17:30). El resultado del insert devuelve un array vacío, y `operator-mode` procede con objetos en memoria **sin `id`** de base de datos.

```text
Flujo actual:
  signal-engine genera TSLA SHORT → signal_key = "...|TSLA|short|...|2026-04-15"
  1er intento (14:53): INSERT OK → signal persiste con ID
  Posición se abre, cierra con pérdida
  2do intento (17:30): UPSERT ignoreDuplicates → SILENTLY SKIPPED
  operator-mode recibe signal sin ID → orders.signal_id = NULL
  Signal Center: no hay registro → usuario no ve reasoning/score
```

### Plan de corrección

#### 1. Hacer `signal_key` único por ejecución (no por día)
Cambiar la composición del `signal_key` para incluir un timestamp o secuencia, permitiendo múltiples señales del mismo símbolo+dirección en el mismo día.

**Archivo**: `supabase/functions/signal-engine/index.ts` (~línea 1007)
```
// Antes:
signal_key: `${user_id}|${symbol}|${direction}|1d|${date}`

// Después:  
signal_key: `${user_id}|${symbol}|${direction}|1d|${isoTimestamp}`
```

Esto permite que cada ejecución del operator cree una señal nueva, aunque sea el mismo símbolo y dirección.

#### 2. Validar que `trade.id` exista antes de ejecutar
En `operator-mode`, después de recibir señales del `signal-engine`, verificar que cada señal tenga un `id` válido (UUID de la DB). Si no lo tiene, es porque el insert falló silenciosamente → loggear error y no ejecutar sin señal vinculada.

**Archivo**: `supabase/functions/operator-mode/index.ts` (~línea 710)
- Añadir check: si `trade.id` no es un UUID válido, loggear y skipear.
- Alternativa: si `ignoreDuplicates` retorna vacío, hacer un SELECT para obtener la señal existente y usar su `id`.

#### 3. Guardar memoria del fix

### Archivos a modificar
- `supabase/functions/signal-engine/index.ts` — signal_key con timestamp
- `supabase/functions/operator-mode/index.ts` — validar signal ID antes de ejecutar

