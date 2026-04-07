

## Diagnóstico

La app se queda infinitamente en "LHYDBRA Loading..." porque:

1. **`getUser()` cuelga**: Si hay un token stale en localStorage, `getUser()` hace una llamada de red que puede nunca resolver (timeout del servidor).
2. **Race condition**: `onAuthStateChange` dispara inmediatamente con la sesión cacheada, y su `await validateSession()` compite con `initializeAuth()`. Si `clearLocalSession()` se ejecuta (porque `getUser()` falla), dispara otro `onAuthStateChange` que vuelve a llamar `validateSession` - loop potencial.
3. **`loading` nunca llega a `false`**: Si `getUser()` cuelga, el `finally` de `initializeAuth` nunca se ejecuta.

## Plan de corrección

### 1. Simplificar `useAuth.tsx`

- **No usar `getUser()` durante inicialización** - `getSession()` ya valida el JWT localmente. Solo usar `getUser()` si realmente necesitamos verificar contra el servidor.
- **Confiar en `onAuthStateChange`** para actualizaciones de sesión en lugar de re-validar manualmente.
- **Agregar timeout de seguridad** para que `loading` siempre se ponga en `false` tras 5 segundos máximo.
- **No llamar `signOut` dentro del listener** para evitar loops recursivos de `onAuthStateChange`.

```text
Flujo simplificado:
1. onAuthStateChange (set first) → actualiza user/session directamente
2. getSession() → aplica sesión inicial, setLoading(false)
3. Si el token es inválido, Supabase dispara SIGNED_OUT automáticamente
4. Timeout de 5s como safety net
```

### 2. Cambios específicos en `src/hooks/useAuth.tsx`

- Eliminar `validateSession` y `clearLocalSession`
- En `onAuthStateChange`: simplemente hacer `setSession(s); setUser(s?.user ?? null); setLoading(false)`
- En `initializeAuth`: solo `getSession()`, aplicar resultado, `setLoading(false)`
- Agregar `setTimeout(() => setLoading(false), 5000)` como safety net

### 3. Verificar `signIn` y `signOut`

- `signIn`: Mantener `signOut({ scope: 'local' })` antes de intentar login
- `signOut`: Mantener `signOut({ scope: 'local' })` + limpiar estado

---

**Resultado esperado**: La app mostrará el formulario de login en menos de 1 segundo cuando no hay sesión, y el dashboard instantáneamente cuando hay sesión válida. Nunca se quedará pegada en "Loading...".

