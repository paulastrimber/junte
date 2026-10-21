// Esquemas Zod de la edición de catálogos (panel de administración, S6). Mismos límites que los validadores
// $jsonSchema de migrations/20261011190000-create-catalogs.js. La key y el "padre" (categoría, universidad, ciudad) se
// eligen al crear y no cambian después: cambiarlos rompería a los usuarios y planes que ya los guardaron.
import { KEY_MAX_LENGTH, KEY_PATTERN, OTHER } from '../../shared/catalog-keys.js'
import { z } from '../../shared/validation.js'

export const ADMIN_CATALOGS = Object.freeze(['interest-categories', 'interests', 'universities', 'careers', 'cities', 'neighborhoods'])

const keyField = z.string().trim().min(1).max(KEY_MAX_LENGTH)
  .regex(KEY_PATTERN, { error: 'Solo minúsculas, números y guiones (por ejemplo, "salir-a-correr")' })
const newKeyField = keyField.refine((key) => key !== OTHER, { error: `"${OTHER}" está reservada para la opción "Otra"` })
const nameField = z.string().trim().min(1).max(120)
const orderField = z.number().int().min(0).max(100_000)
const minAgeField = z.number().int().min(16).max(99)
const shortNameField = z.string().trim().min(1).max(20)
const groupField = z.string().trim().min(1).max(120)
const departmentField = z.string().trim().min(1).max(120)

const COMMON_CREATE = { key: newKeyField, name: nameField, order: orderField.default(0), active: z.boolean().default(true) }
const COMMON_UPDATE = { name: nameField.optional(), order: orderField.optional(), active: z.boolean().optional() }

const atLeastOne = (schema) => schema.refine((body) => Object.keys(body).length > 0, { error: 'Mandá al menos un campo para cambiar' })

/** Por catálogo: esquema de alta y de modificación. En la modificación, `null` quita un campo opcional. */
export const CATALOG_BODIES = Object.freeze({
  'interest-categories': {
    create: z.strictObject(COMMON_CREATE),
    update: atLeastOne(z.strictObject(COMMON_UPDATE))
  },
  interests: {
    create: z.strictObject({ ...COMMON_CREATE, categoryKey: keyField, minAge: minAgeField.optional() }),
    update: atLeastOne(z.strictObject({ ...COMMON_UPDATE, minAge: minAgeField.nullable().optional() }))
  },
  universities: {
    create: z.strictObject({ ...COMMON_CREATE, shortName: shortNameField }),
    update: atLeastOne(z.strictObject({ ...COMMON_UPDATE, shortName: shortNameField.optional() }))
  },
  careers: {
    create: z.strictObject({ ...COMMON_CREATE, universityKey: keyField, group: groupField.optional() }),
    update: atLeastOne(z.strictObject({ ...COMMON_UPDATE, group: groupField.nullable().optional() }))
  },
  cities: {
    create: z.strictObject({ ...COMMON_CREATE, department: departmentField }),
    update: atLeastOne(z.strictObject({ ...COMMON_UPDATE, department: departmentField.optional() }))
  },
  neighborhoods: {
    create: z.strictObject({ ...COMMON_CREATE, cityKey: keyField, ineCode: z.number().int().min(1).optional() }),
    update: atLeastOne(z.strictObject(COMMON_UPDATE))
  }
})
