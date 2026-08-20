#!/bin/bash
cd "$(dirname "$0")"
echo "📦 Publicando cambios de Escaleras a GitHub..."
git add -A
if git diff --cached --quiet; then
  echo "✅ No hay cambios nuevos que publicar."
else
  git commit -m "Actualización $(date '+%Y-%m-%d %H:%M')"
  git push
  echo "✅ Listo, cambios publicados."
fi
read -p "Presiona ENTER para cerrar..."
