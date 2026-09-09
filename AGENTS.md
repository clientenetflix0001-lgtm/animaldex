# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Base obligatoria: `cursor/animaldex-stable-base`

Todo trabajo futuro **debe** partir de la rama `cursor/animaldex-stable-base`.

- Snapshot funcional (sin cambios de producto después de este commit): `50968363a130a525781aa84e6569ab43605662a9`
- Inventario de funciones críticas actuales: `STABLE_BASE.md`
- Crear ramas nuevas con `git checkout -b cursor/<nombre> cursor/animaldex-stable-base` (o desde el HEAD actual de esa rama)
- **No** partir de `main` ni de ramas anteriores (`cursor/protector-pet-counters-6902`, `cursor/all-public-resources-guest-6902`, etc.)
- **No** cherry-pickear archivos viejos sobre este stack
- **No** merge a `main`, **no** OTA (`eas update`), **no** deploy (Worker, Pages, D1, Android, Twilio) salvo orden explícita del usuario
