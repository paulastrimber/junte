// Regla de "perfil completo", pura y sin dependencias (la usan el servicio y el serializer).
const isValidDate = (value) => value instanceof Date && !Number.isNaN(value.getTime())

/**
 * Perfil completo = name + birthDate + al menos 1 interés. university, barrio y localidad son
 * opcionales. Lo usa POST /plans (S3): sin perfil completo → 409 PROFILE_INCOMPLETE.
 * @param {{ name?: string, birthDate?: Date | null, interests?: string[] } | null | undefined} user
 * @returns {boolean}
 */
export function isProfileComplete (user) {
  if (!user) return false
  return typeof user.name === 'string' && user.name.trim() !== '' &&
    isValidDate(user.birthDate) &&
    Array.isArray(user.interests) && user.interests.length >= 1
}
