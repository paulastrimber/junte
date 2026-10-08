// Datos de desarrollo. Ficticios: emails en el TLD reservado `.test`, sin contraseñas reales.
// Coordenadas GeoJSON [lng, lat] en Montevideo.

const UM = 'Universidad de Montevideo'

export const USERS = Object.freeze([
  { key: 'admin', email: 'admin@junte.test', name: 'Admin junte', university: UM, interests: [], role: 'admin', status: 'active' },
  { key: 'lucia', email: 'lucia@junte.test', name: 'Lucía Pérez', university: UM, interests: ['futbol', 'running', 'musica'], role: 'user', status: 'active' },
  { key: 'mateo', email: 'mateo@junte.test', name: 'Mateo Rodríguez', university: UM, interests: ['estudio', 'juegos-de-mesa', 'cine'], role: 'user', status: 'active' },
  { key: 'sofia', email: 'sofia@junte.test', name: 'Sofía González', university: UM, interests: ['running', 'cine'], role: 'user', status: 'active' },
  // Para probar el 401 de cuentas suspendidas.
  { key: 'suspendido', email: 'suspendido@junte.test', name: 'Cuenta Suspendida', university: UM, interests: ['futbol'], role: 'user', status: 'suspended' }
])

// `daysFromNow` + `hour` (hora de Montevideo, UTC−3) se convierten a fecha al sembrar, así los planes
// quedan siempre en el futuro aunque se vuelva a correr el seed otro día.
export const PLANS = Object.freeze([
  {
    key: 'futbol-parque-rodo',
    creator: 'lucia',
    title: 'Fútbol 5 en Parque Rodó',
    description: 'Partido tranquilo después de clase. Traer camiseta clara y oscura.',
    daysFromNow: 2,
    hour: 19,
    location: { label: 'Parque Rodó', coordinates: [-56.1660, -34.9130] },
    interests: ['futbol'],
    capacity: 10,
    participants: ['lucia', 'mateo']
  },
  {
    key: 'running-rambla',
    creator: 'sofia',
    title: 'Running por la Rambla de Pocitos',
    description: '5 km a ritmo suave, salimos desde la escollera.',
    daysFromNow: 3,
    hour: 8,
    location: { label: 'Rambla de Pocitos', coordinates: [-56.1540, -34.9115] },
    interests: ['running'],
    capacity: 15,
    participants: ['sofia', 'lucia']
  },
  {
    key: 'estudio-um',
    creator: 'mateo',
    title: 'Grupo de estudio: Aplicaciones Móviles',
    description: 'Repaso para el parcial en la biblioteca.',
    daysFromNow: 4,
    hour: 17,
    location: { label: 'Universidad de Montevideo', coordinates: [-56.1555, -34.9180] },
    interests: ['estudio'],
    capacity: 6,
    participants: ['mateo']
  },
  {
    key: 'juegos-ciudad-vieja',
    creator: 'mateo',
    title: 'Juegos de mesa en Ciudad Vieja',
    description: 'Catan y Dixit en un bar cerca de Plaza Independencia.',
    daysFromNow: 6,
    hour: 20,
    location: { label: 'Ciudad Vieja', coordinates: [-56.2005, -34.9065] },
    interests: ['juegos-de-mesa'],
    capacity: 2,
    participants: ['mateo', 'sofia']
  },
  {
    key: 'cine-parque-batlle',
    creator: 'sofia',
    title: 'Cine al aire libre en Parque Batlle',
    description: 'Llevar manta y algo para compartir.',
    daysFromNow: 8,
    hour: 21,
    location: { label: 'Parque Batlle', coordinates: [-56.1580, -34.8960] },
    interests: ['cine'],
    capacity: 20,
    participants: []
  }
])
