// Colecciones de catálogos (docs/arquitectura/07-modelo-de-datos.md#catálogos). Índices y validadores:
// migrations/20261011190000-create-catalogs.js. Se cargan con catalogs/ (syncCatalogs) y las edita el admin (S6).
import mongoose from 'mongoose'

function catalogSchema (collection, fields) {
  return new mongoose.Schema({
    key: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    order: { type: Number, required: true, default: 0 },
    // Se desactiva en lugar de borrar: los usuarios que ya lo eligieron lo conservan.
    active: { type: Boolean, required: true, default: true },
    ...fields
  }, { collection, timestamps: true, autoIndex: false, autoCreate: false })
}

const define = (name, collection, fields) => mongoose.models[name] ?? mongoose.model(name, catalogSchema(collection, fields))

export const InterestCategory = define('InterestCategory', 'interestCategories', {})
export const Interest = define('Interest', 'interests', { categoryKey: { type: String, required: true }, minAge: { type: Number } })
export const University = define('University', 'universities', { shortName: { type: String, required: true, trim: true } })
export const Career = define('Career', 'careers', { universityKey: { type: String, required: true }, group: { type: String, trim: true } })
export const City = define('City', 'cities', { department: { type: String, required: true, trim: true } })
export const Neighborhood = define('Neighborhood', 'neighborhoods', { cityKey: { type: String, required: true }, ineCode: { type: Number } })
