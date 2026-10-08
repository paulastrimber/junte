// ESLint (flat config): neostandard + fronteras de capas de docs/arquitectura/03-back-service.md.
// Aplica a todo back-service/ (src, migrations, seeds, scripts, tests). S1-BE-08.
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import importPlugin from 'eslint-plugin-import'
import neostandard from 'neostandard'

// Módulos previstos en 03 + los que existan en disco (así un módulo nuevo queda cubierto solo).
const PLANNED_MODULES = [
  'auth', 'users', 'plans', 'participations', 'checkins', 'feed',
  'messages', 'reports', 'devices', 'uploads', 'admin'
]

function listModules (basePath) {
  try {
    return readdirSync(join(basePath, 'src/modules'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return [] // sin src/modules todavía: alcanza con los previstos
  }
}

const MODEL_IMPORT = { regex: '\\.model(\\.js)?$', message: 'Usá el repositorio inyectado, no el modelo.' }
const REPOSITORY_IMPORT = { regex: '\\.repository(\\.js)?$', message: 'El controlador habla con el servicio, no con el repositorio.' }

/**
 * Reglas de dependencia entre capas. Exportada para testear las reglas sobre un árbol de fixtures.
 * - `no-restricted-imports` mira el texto del import: funciona aunque el archivo no exista.
 * - `import/no-restricted-paths` resuelve el import a un archivo real: cubre fronteras entre carpetas.
 * @param {{ basePath: string, modules?: string[] }} options
 * @returns {import('eslint').Linter.Config[]}
 */
export function createBoundaryConfig ({ basePath, modules = [] }) {
  const allModules = [...new Set([...PLANNED_MODULES, ...modules, ...listModules(basePath)])]

  // Entre módulos solo vía index.js: una zona por par (módulo que importa, módulo importado).
  const crossModuleZones = allModules.flatMap((target) => allModules
    .filter((from) => from !== target)
    .map((from) => ({
      target: `./src/modules/${target}`,
      from: `./src/modules/${from}`,
      except: ['./index.js'],
      message: `Desde "${target}" solo se importa la API pública de "${from}" (src/modules/${from}/index.js).`
    })))

  return [
    {
      name: 'junte/boundaries',
      files: ['**/*.js'],
      plugins: { import: importPlugin },
      rules: {
        'import/no-restricted-paths': ['error', {
          basePath,
          zones: [
            {
              target: './src/shared',
              from: './src/modules',
              message: 'shared/ no depende de ningún módulo de dominio.'
            },
            ...crossModuleZones
          ]
        }]
      }
    },
    {
      name: 'junte/services',
      files: ['src/**/*.service.js'],
      rules: {
        'no-restricted-imports': ['error', {
          paths: [
            { name: 'express', message: 'Un servicio no conoce HTTP: recibe datos planos del controlador.' },
            { name: 'mongoose', message: 'Un servicio no accede a la DB: recibe repositorios por parámetro (DI).' }
          ],
          patterns: [
            MODEL_IMPORT,
            { regex: '/adapters/db(/index(\\.js)?)?$', message: 'Recibí withTransaction por parámetro (DI), no importes el adapter.' }
          ]
        }]
      }
    },
    {
      name: 'junte/controllers',
      files: ['src/**/*.controller.js'],
      rules: {
        'no-restricted-imports': ['error', {
          paths: [{ name: 'mongoose', message: 'El controlador no accede a la DB.' }],
          patterns: [MODEL_IMPORT, REPOSITORY_IMPORT]
        }]
      }
    }
  ]
}

export default [
  { name: 'junte/ignores', ignores: ['node_modules/**', 'coverage/**'] },
  ...neostandard({ noJsx: true }),
  ...createBoundaryConfig({ basePath: import.meta.dirname })
]
