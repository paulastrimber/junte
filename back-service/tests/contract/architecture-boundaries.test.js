// Contrato de arquitectura (S1-BE-08): las fronteras de docs/arquitectura/03-back-service.md
// se hacen cumplir con ESLint. Se lintea código en memoria (lintText) con la config real, así
// no queda ningún archivo que rompa el lint en el repo.
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createBoundaryConfig } from '../../eslint.config.js'

const BACK_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')

async function lintWithRealConfig (code, filePath) {
  const eslint = new ESLint({ cwd: BACK_ROOT })
  const [result] = await eslint.lintText(code, { filePath: join(BACK_ROOT, filePath) })
  return result.messages
}

const ruleIds = (messages) => messages.map((message) => message.ruleId)

describe('config real (eslint.config.js)', () => {
  it('importar mongoose en un *.service.js falla el lint', async () => {
    const messages = await lintWithRealConfig(
      "import mongoose from 'mongoose'\n\nexport const model = mongoose.model\n",
      'src/modules/plans/plan.service.js'
    )
    expect(messages).toEqual([expect.objectContaining({ ruleId: 'no-restricted-imports', severity: 2 })])
  })

  it('importar express o un modelo en un servicio falla el lint', async () => {
    const messages = await lintWithRealConfig(
      "import express from 'express'\nimport { PlanModel } from './plan.model.js'\n\nexport const deps = [express, PlanModel]\n",
      'src/modules/plans/plan.service.js'
    )
    expect(ruleIds(messages)).toEqual(['no-restricted-imports', 'no-restricted-imports'])
  })

  it('un controlador no importa modelos ni repositorios', async () => {
    const messages = await lintWithRealConfig(
      "import { PlanModel } from './plan.model.js'\nimport { createPlanRepository } from './plan.repository.js'\n\nexport const deps = [PlanModel, createPlanRepository]\n",
      'src/modules/plans/plan.controller.js'
    )
    expect(ruleIds(messages)).toEqual(['no-restricted-imports', 'no-restricted-imports'])
  })

  it('un servicio que recibe sus dependencias por parámetro pasa el lint', async () => {
    const messages = await lintWithRealConfig(
      "import { AppError } from '../../shared/errors.js'\n\nexport function createPlanService ({ planRepo }) {\n  return { get: (id) => planRepo.findById(id) ?? new AppError('NOT_FOUND', 'x') }\n}\n",
      'src/modules/plans/plan.service.js'
    )
    expect(messages).toEqual([])
  })

  it('mongoose sí se puede importar en un modelo o repositorio', async () => {
    const messages = await lintWithRealConfig(
      "import mongoose from 'mongoose'\n\nexport const PlanModel = mongoose.model\n",
      'src/modules/plans/plan.model.js'
    )
    expect(messages).toEqual([])
  })
})

// `import/no-restricted-paths` resuelve el import a un archivo real, así que se prueba sobre un
// árbol de fixtures temporal (fuera del repo) con las mismas reglas que exporta eslint.config.js.
describe('fronteras entre carpetas (import/no-restricted-paths)', () => {
  let fixtureRoot

  function write (relativePath, content = 'export const x = 1\n') {
    const fullPath = join(fixtureRoot, relativePath)
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, content)
  }

  async function lintFixture (code, filePath) {
    const eslint = new ESLint({
      cwd: fixtureRoot,
      overrideConfigFile: true,
      overrideConfig: createBoundaryConfig({ basePath: fixtureRoot, modules: ['plans', 'users'] })
    })
    const [result] = await eslint.lintText(code, { filePath: join(fixtureRoot, filePath) })
    return result.messages
  }

  beforeAll(() => {
    fixtureRoot = realpathSync(mkdtempSync(join(tmpdir(), 'junte-lint-')))
    write('src/modules/users/index.js')
    write('src/modules/users/user.repository.js')
    write('src/modules/plans/plan.repository.js')
    write('src/shared/errors.js')
  })

  afterAll(() => {
    rmSync(fixtureRoot, { recursive: true, force: true })
  })

  it('entre módulos solo se importa desde index.js', async () => {
    const bad = await lintFixture(
      "import { x } from '../users/user.repository.js'\nexport const y = x\n",
      'src/modules/plans/plan.service.js'
    )
    expect(ruleIds(bad)).toEqual(['import/no-restricted-paths'])

    const good = await lintFixture(
      "import { x } from '../users/index.js'\nexport const y = x\n",
      'src/modules/plans/plan.service.js'
    )
    expect(good).toEqual([])
  })

  it('dentro del mismo módulo se puede importar cualquier archivo', async () => {
    const messages = await lintFixture(
      "import { x } from './plan.repository.js'\nexport const y = x\n",
      'src/modules/plans/plan.controller-helper.js'
    )
    expect(messages).toEqual([])
  })

  it('shared/ no importa nada de modules/', async () => {
    const messages = await lintFixture(
      "import { x } from '../modules/users/index.js'\nexport const y = x\n",
      'src/shared/pagination.js'
    )
    expect(ruleIds(messages)).toEqual(['import/no-restricted-paths'])
  })
})
