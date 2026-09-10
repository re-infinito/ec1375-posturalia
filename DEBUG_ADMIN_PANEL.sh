#!/bin/bash

# Script de debugging rápido para admin panel

echo "🔍 DEBUG ADMIN PANEL - EC1375"
echo "=============================="
echo ""

# Verificación 1: ¿Existen los exports en auth.js?
echo "✓ Verificación 1: Exports en auth.js"
if grep -q "window.supabaseClient = supabaseClient" /home/user/ec1375-posturalia/auth.js; then
    echo "  ✅ window.supabaseClient export presente"
else
    echo "  ❌ window.supabaseClient export FALTA"
fi

if grep -q "window.Auth = Auth" /home/user/ec1375-posturalia/auth.js; then
    echo "  ✅ window.Auth export presente"
else
    echo "  ❌ window.Auth export FALTA"
fi

echo ""

# Verificación 2: ¿Admin-sesiones.html usa los globals?
echo "✓ Verificación 2: admin-sesiones.html referencias"
if grep -q "window.supabaseClient" /home/user/ec1375-posturalia/admin-sesiones.html; then
    echo "  ✅ Usa window.supabaseClient"
else
    echo "  ❌ No usa window.supabaseClient"
fi

if grep -q "Auth.getSession" /home/user/ec1375-posturalia/admin-sesiones.html; then
    echo "  ✅ Usa Auth.getSession()"
else
    echo "  ❌ No usa Auth.getSession()"
fi

echo ""

# Verificación 3: ¿CDN Supabase carga?
echo "✓ Verificación 3: Dependencias en HTML"
if grep -q "@supabase/supabase-js" /home/user/ec1375-posturalia/admin-sesiones.html; then
    echo "  ✅ Admin panel carga @supabase/supabase-js CDN"
else
    echo "  ❌ CDN Supabase no está en admin panel"
fi

if grep -q "auth.js" /home/user/ec1375-posturalia/admin-sesiones.html; then
    echo "  ✅ Admin panel carga auth.js"
else
    echo "  ❌ auth.js no cargado en admin panel"
fi

echo ""

# Verificación 4: Último commit
echo "✓ Verificación 4: Git status"
LAST_COMMIT=$(git -C /home/user/ec1375-posturalia log --oneline -1)
echo "  Último commit: $LAST_COMMIT"

if [[ "$LAST_COMMIT" == *"auth.js"* ]] || [[ "$LAST_COMMIT" == *"window"* ]] || [[ "$LAST_COMMIT" == *"Fix"* ]]; then
    echo "  ✅ Última actualización relacionada al fix"
else
    echo "  ⚠️  Último commit puede no ser el fix"
fi

echo ""
echo "=============================="
echo "✓ Verificaciones completadas"
echo ""
echo "📝 Próximos pasos:"
echo "1. Si todo ✅: Hard refresh admin panel (Ctrl+Shift+R)"
echo "2. Si algo ❌: Revisar auth.js y admin-sesiones.html"
echo "3. Si persiste: Abrir DevTools (F12) y revisar Console"
echo ""
