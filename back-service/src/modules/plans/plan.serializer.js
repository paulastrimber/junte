// La "vista" del plan: el único lugar que decide qué sale en el JSON. Lista blanca explícita (nunca `...plan`):
// `photoKey`, `qrNonceHash` y los campos internos quedan afuera aunque el modelo cambie.
import { READ_URL_TTL_SECONDS } from '../../shared/uploads.js'
import { availableSpots, isFull } from './plan.rules.js'

/**
 * @param {object} deps
 * @param {import('../../adapters/storage/index.js').Storage} deps.storage
 * @param {(user: object) => Promise<{ id: string, name: string | null, photoUrl: string | null }>} deps.serializeCreator
 *   Vista pública de un usuario (módulo `users`).
 */
export function createPlanSerializer ({ storage, serializeCreator }) {
  /**
   * @param {{ plan: import('./plan.repository.js').PlanEntity, creator: object | null }} item
   * @param {string} viewerId  Usuario del token: decide `isCreator`.
   */
  async function serialize ({ plan, creator }, viewerId) {
    return {
      id: plan.id,
      title: plan.title,
      description: plan.description || null,
      startsAt: plan.startsAt.toISOString(),
      endsAt: plan.endsAt.toISOString(),
      location: { label: plan.location.label, type: 'Point', coordinates: plan.location.coordinates },
      interests: plan.interests,
      university: plan.university ?? null,
      // `capacity: null` = cupo ilimitado: `availableSpots` también es null y `isFull` siempre false.
      capacity: plan.capacity,
      participantCount: plan.participantCount,
      availableSpots: availableSpots(plan),
      isFull: isFull(plan),
      price: plan.price,
      status: plan.status,
      photoUrl: plan.photoKey
        ? await storage.presignDownload({ key: plan.photoKey, expiresInSeconds: READ_URL_TTL_SECONDS })
        : null,
      creator: creator ? await serializeCreator(creator) : null,
      isCreator: plan.creatorId === viewerId,
      // Solo en el feed por cercanía: distancia al punto consultado, redondeada (no revela la posición de nadie).
      ...(plan.distanceMeters !== undefined ? { distanceMeters: Math.round(plan.distanceMeters) } : {}),
      createdAt: plan.createdAt.toISOString()
    }
  }

  return {
    serialize,

    /** @param {{ items: Array<{ plan: object, creator: object | null }>, nextCursor: string | null }} page */
    async serializePage ({ items, nextCursor }, viewerId) {
      return { items: await Promise.all(items.map((item) => serialize(item, viewerId))), nextCursor }
    }
  }
}
