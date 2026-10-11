// Universidades iniciales del catálogo. Las cinco privadas figuran en el listado de universidades autorizadas del MEC
// (abril 2024); Udelar y UTEC son públicas. Los institutos universitarios (IUACJ, Crandon, etc.) los suma el admin.
// "Otra" no es una fila: es la clave reservada `other` (shared/catalog-keys.js).

export const UNIVERSITIES = Object.freeze([
  { key: 'um', name: 'Universidad de Montevideo', shortName: 'UM' },
  { key: 'ort', name: 'Universidad ORT Uruguay', shortName: 'ORT' },
  { key: 'ucu', name: 'Universidad Católica del Uruguay', shortName: 'UCU' },
  { key: 'udelar', name: 'Universidad de la República', shortName: 'Udelar' },
  { key: 'ude', name: 'Universidad de la Empresa', shortName: 'UDE' },
  { key: 'uclaeh', name: 'Universidad CLAEH', shortName: 'UCLAEH' },
  { key: 'utec', name: 'Universidad Tecnológica', shortName: 'UTEC' }
])
