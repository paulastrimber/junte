# 0006 · JavaScript ESM + neostandard en todo el código

- **Estado:** Aceptada
- **Fecha:** 2026-10-07

## Contexto

El curso trabaja con JavaScript moderno (ES6+), módulos `import`/`export`, prefijo `node:` y referencia JavaScript Standard Style. Hay tres bases de código (app, Nginx-admin, back) y varias personas escribiendo.

## Decisión

- JavaScript (no TypeScript) con **módulos ESM** (`"type": "module"` en el back).
- Estilo **neostandard** (sucesor de `standard` compatible con ESLint 9) en back y app: sin punto y coma, comillas simples, 2 espacios.
- JSDoc en las funciones públicas de servicios y repositorios para tipos en el editor.
- Zod como fuente de verdad de la forma de los datos que entran.

## Alternativas consideradas

- **TypeScript**: más seguridad de tipos, pero agrega una curva y configuración que el curso no cubre.
- **Prettier + ESLint recomendado**: válido, pero el curso ya apunta a Standard.

## Consecuencias

- `npm run lint` debe pasar en CI; el formato no se discute en las revisiones.
- Reglas en [practicas/estilo-de-codigo.md](../../practicas/estilo-de-codigo.md).
