// Datos de desarrollo. Ficticios: emails en el TLD reservado `.test`, sin contraseñas reales.
// Coordenadas GeoJSON [lng, lat] en Montevideo.

// `birthDate` es un día del calendario (YYYY-MM-DD, se guarda a medianoche UTC). Universidad, carrera, ciudad, barrio e
// intereses son keys de los catálogos (catalogs/). La contraseña de todos sale de SEED_PASSWORD (ver seeds/index.js),
// nunca de este archivo. `onboarded: false` deja al usuario con el onboarding pendiente (para probarlo en la app).

export const USERS = Object.freeze([
  { key: 'admin', email: 'admin@junte.test', name: 'Admin junte', birthDate: '1990-05-20', university: 'um', career: 'ingenieria-en-informatica', city: 'montevideo', neighborhood: 'centro', interests: [], role: 'admin', status: 'active', onboarded: true },
  { key: 'lucia', email: 'lucia@junte.test', name: 'Lucía Pérez', birthDate: '2002-03-14', university: 'um', career: 'ingenieria-en-informatica', city: 'montevideo', neighborhood: 'pocitos', interests: ['futbol', 'running', 'musica'], role: 'user', status: 'active', onboarded: true },
  { key: 'mateo', email: 'mateo@junte.test', name: 'Mateo Rodríguez', birthDate: '2001-11-02', university: 'ort', career: 'ingenieria-en-sistemas', city: 'montevideo', neighborhood: 'cordon', interests: ['estudio', 'juegos-de-mesa', 'cine'], role: 'user', status: 'active', onboarded: true },
  { key: 'sofia', email: 'sofia@junte.test', name: 'Sofía González', birthDate: '2003-07-29', university: 'ucu', career: 'psicologia', city: 'montevideo', neighborhood: 'punta-carretas', interests: ['running', 'cine'], role: 'user', status: 'active', onboarded: true },
  // Para probar el onboarding: solo tiene nombre, email y contraseña.
  { key: 'nuevo', email: 'nuevo@junte.test', name: 'Usuario Nuevo', interests: [], role: 'user', status: 'active', onboarded: false },
  // Para probar el 401 de cuentas suspendidas.
  { key: 'suspendido', email: 'suspendido@junte.test', name: 'Cuenta Suspendida', birthDate: '2000-01-15', university: 'udelar', career: 'abogacia', city: 'montevideo', neighborhood: 'parque-rodo', interests: ['futbol'], role: 'user', status: 'suspended', onboarded: true }
])

// `daysFromNow` + `hour` (hora de Montevideo, UTC−3) se convierten a fecha al sembrar, así los planes
// quedan siempre en el futuro aunque se vuelva a correr el seed otro día. `durationHours` (2 por defecto) define
// `endsAt`; `price` es el costo en pesos uruguayos (0 por defecto = gratis); `capacity: null` es cupo ilimitado.
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
    durationHours: 1,
    price: 150,
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
    durationHours: 3,
    price: 350,
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
    capacity: null, // cupo ilimitado
    participants: []
  }
])
