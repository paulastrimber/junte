// Vistas del panel de administración. Listas blancas explícitas (nunca `...entity`): un admin ve el email y el estado de
// una cuenta para poder identificarla, pero nunca hashes, sesiones, la fecha de nacimiento ni la ubicación del perfil.

/** @param {import('../users/user.repository.js').UserEntity | null} user */
export function serializeAdminUser (user) {
  if (!user) return null
  return {
    id: user.id,
    name: user.name ?? null,
    email: user.email,
    role: user.role,
    status: user.status,
    reputation: user.reputation,
    createdAt: user.createdAt.toISOString()
  }
}

/** @param {{ message: object, sender: object | null }} params */
export function serializeAdminMessage ({ message, sender }) {
  return {
    id: message.id,
    planId: message.planId,
    type: message.type,
    text: message.text,
    // Notas de voz: el panel muestra la duración; el audio no se reproduce desde el panel (ver docs/pendientes.md).
    ...(message.type === 'voice' ? { durationMs: message.durationMs } : {}),
    status: message.status,
    createdAt: message.createdAt.toISOString(),
    sender: serializeAdminUser(sender)
  }
}

function previewOf (type, target) {
  if (type === 'user') return serializeAdminUser(target.user)
  if (type === 'plan') {
    const { plan, creator } = target
    if (!plan) return null
    return {
      id: plan.id,
      title: plan.title,
      description: plan.description ?? null,
      status: plan.status,
      startsAt: plan.startsAt.toISOString(),
      locationLabel: plan.location.label,
      creator: serializeAdminUser(creator)
    }
  }
  const { message, plan, sender } = target
  if (!message) return null
  return {
    ...serializeAdminMessage({ message, sender }),
    plan: plan ? { id: plan.id, title: plan.title } : null
  }
}

/** @param {import('./admin.service.js').ReportItem} item */
export function serializeReportItem ({ report, reporter, resolver, target, pendingForTarget }) {
  return {
    id: report.id,
    status: report.status,
    reason: report.reason,
    description: report.description,
    createdAt: report.createdAt.toISOString(),
    resolvedAt: report.resolvedAt ? report.resolvedAt.toISOString() : null,
    resolvedBy: resolver ? { id: resolver.id, name: resolver.name ?? null } : null,
    reporter: serializeAdminUser(reporter),
    target: {
      type: report.targetType,
      id: report.targetId,
      // Reportes pendientes sobre lo mismo, de cualquier persona (incluido este si sigue pendiente).
      pendingReports: pendingForTarget,
      // null si lo reportado ya no existe.
      preview: previewOf(report.targetType, target)
    }
  }
}

/** Métricas: fechas en ISO, el resto tal cual (solo números). */
export function serializeMetrics ({ generatedAt, since, ...counts }) {
  return { generatedAt: generatedAt.toISOString(), since: since.toISOString(), ...counts }
}
