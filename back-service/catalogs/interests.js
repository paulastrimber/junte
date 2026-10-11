// Intereses iniciales del catálogo: categorías y opciones. El admin (S6) las edita; esto es solo la carga inicial.
// Las `key` no cambian nunca (los usuarios guardan la key). `minAge`: edad mínima para elegirla (por defecto, sin mínimo).
// Las keys de los seeds viejos (futbol, running, estudio, musica, cine, juegos-de-mesa) se conservan.

export const INTEREST_CATEGORIES = Object.freeze([
  { key: 'deportes', name: 'Deportes' },
  { key: 'salidas-y-gastronomia', name: 'Salidas y gastronomía' },
  { key: 'musica', name: 'Música' },
  { key: 'arte-y-cultura', name: 'Arte y cultura' },
  { key: 'entretenimiento', name: 'Entretenimiento' },
  { key: 'aire-libre', name: 'Aire libre' },
  { key: 'estudio-y-carrera', name: 'Estudio y carrera' },
  { key: 'comunidad', name: 'Comunidad' }
])

/** categoryKey → opciones, en el orden en que se muestran. */
export const INTERESTS = Object.freeze({
  deportes: [
    { key: 'futbol', name: 'Fútbol' },
    { key: 'rugby', name: 'Rugby' },
    { key: 'tenis', name: 'Tenis' },
    { key: 'basquetbol', name: 'Básquetbol' },
    { key: 'padel', name: 'Pádel' },
    { key: 'voley', name: 'Vóley' },
    { key: 'handball', name: 'Handball' },
    { key: 'hockey', name: 'Hockey' },
    { key: 'running', name: 'Running' },
    { key: 'ciclismo', name: 'Ciclismo' },
    { key: 'natacion', name: 'Natación' },
    { key: 'gimnasio', name: 'Gimnasio' },
    { key: 'yoga', name: 'Yoga' },
    { key: 'surf-y-paddle', name: 'Surf y paddle' }
  ],
  'salidas-y-gastronomia': [
    { key: 'salir-a-cenar', name: 'Salir a cenar' },
    { key: 'tomar-un-cafe', name: 'Tomar un café' },
    { key: 'mate-en-la-rambla', name: 'Mate en la rambla' },
    { key: 'asado', name: 'Asado' },
    { key: 'brunch', name: 'Brunch' },
    { key: 'cocinar-juntos', name: 'Cocinar juntos' },
    { key: 'bares-y-cervecerias', name: 'Bares y cervecerías', minAge: 18 },
    { key: 'salir-a-bailar', name: 'Salir a bailar', minAge: 18 }
  ],
  musica: [
    { key: 'musica', name: 'Escuchar música' },
    { key: 'tocar-la-guitarra', name: 'Tocar la guitarra' },
    { key: 'tocar-un-instrumento', name: 'Tocar otro instrumento' },
    { key: 'conciertos', name: 'Ir a conciertos' },
    { key: 'cantar-y-karaoke', name: 'Cantar y karaoke' },
    { key: 'candombe', name: 'Candombe' },
    { key: 'danza', name: 'Danza y baile' }
  ],
  'arte-y-cultura': [
    { key: 'teatro', name: 'Teatro' },
    { key: 'museos-y-exposiciones', name: 'Museos y exposiciones' },
    { key: 'dibujo-y-pintura', name: 'Dibujo y pintura' },
    { key: 'fotografia', name: 'Fotografía' },
    { key: 'lectura', name: 'Lectura y club de lectura' },
    { key: 'escritura', name: 'Escritura' }
  ],
  entretenimiento: [
    { key: 'cine', name: 'Cine' },
    { key: 'series-y-maratones', name: 'Series y maratones' },
    { key: 'stand-up', name: 'Stand up' },
    { key: 'juegos-de-mesa', name: 'Juegos de mesa' },
    { key: 'videojuegos', name: 'Videojuegos' },
    { key: 'juegos-de-rol', name: 'Juegos de rol' },
    { key: 'trivia', name: 'Trivia' },
    { key: 'anime', name: 'Anime' }
  ],
  'aire-libre': [
    { key: 'caminatas', name: 'Caminatas' },
    { key: 'camping', name: 'Camping' },
    { key: 'playa', name: 'Playa' },
    { key: 'picnic', name: 'Picnic en parques' },
    { key: 'pesca', name: 'Pesca' },
    { key: 'mascotas', name: 'Pasear mascotas' }
  ],
  'estudio-y-carrera': [
    { key: 'estudio', name: 'Grupo de estudio' },
    { key: 'idiomas', name: 'Intercambio de idiomas' },
    { key: 'programacion', name: 'Programación y hackathons' },
    { key: 'emprendimiento', name: 'Emprendimiento' },
    { key: 'networking', name: 'Networking' }
  ],
  comunidad: [
    { key: 'voluntariado', name: 'Voluntariado' },
    { key: 'eventos-universitarios', name: 'Eventos universitarios' },
    { key: 'ferias-y-mercados', name: 'Ferias y mercados' }
  ]
})
