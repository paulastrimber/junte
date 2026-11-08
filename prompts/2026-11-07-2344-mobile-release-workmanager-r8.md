# Mobile: crash al abrir el APK release (WorkManager/Room y R8)

- **Autor:** @paustever
- **Fecha:** 2026-11-07T23:44:16-03:00

## Prompt

Contexto: proyecto junte, app en mobile/ (Expo SDK 58). Compilé un APK con EAS
(perfil local "entrega", basado en "preview", buildType apk) y en un teléfono real
(ZTE Blade A76 5G, MyOS 15) la app se cierra al abrir. adb logcat -b crash:

FATAL EXCEPTION: main · Process: com.junte.app
java.lang.RuntimeException: Unable to get provider androidx.startup.InitializationProvider:
  java.lang.RuntimeException: Failed to create an instance of class androidx.work.impl.WorkDatabase.canonicalName
  at androidx.startup.InitializationProvider.onCreate
  at androidx.work.WorkManagerInitializer.b
(nombres ofuscados por R8: ta1.u, po7.a, r8-map-id-...)

Hipótesis: el build release tiene R8/minify y está borrando o renombrando la
implementación generada de Room para WorkManager (WorkDatabase_Impl), que Room crea
por reflexión. WorkManager lo trae alguna dependencia nativa (react-native-maps,
expo-notifications o Firebase Messaging).

Lo que necesito:
1. Confirmá de dónde viene el minify en este SDK (app.config.js no tiene
   expo-build-properties) y qué dependencia trae WorkManager/Room.
2. Proponé el arreglo mínimo, preferentemente reglas de keep de ProGuard/R8 con
   expo-build-properties (android.extraProguardRules) para Room/WorkManager
   (por ejemplo, -keep class * extends androidx.room.RoomDatabase { <init>(); }),
   en vez de apagar el minify. Explicá la alternativa (enableMinifyInReleaseBuilds: false)
   y por qué elegís una.
3. Si hace falta agregar expo-build-properties, que quede en package.json y package-lock.json.
4. Corré task ci (o los tests de mobile) y verificá que `npx expo config` siga resolviendo.
5. Rama fix/mobile-release-workmanager-r8, commit Conventional Commits en inglés,
   docs en español (anotalo en docs/pendientes.md o en la doc de la app), PR contra main.
   En la descripción: hay que recompilar un APK y abrirlo en un teléfono real para cerrarlo.

No muestres secretos (claves de Maps, google-services.json, credenciales).
