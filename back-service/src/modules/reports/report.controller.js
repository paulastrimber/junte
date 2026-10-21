// Adapta HTTP: lee la request ya validada y llama al servicio. La identidad sale del token (req.user.id).

/**
 * @param {{ reportService: ReturnType<import('./report.service.js').createReportService> }} deps
 */
export function createReportController ({ reportService }) {
  return {
    async create (req, res) {
      const { report, created } = await reportService.create({ ...req.body, reporterId: req.user.id })
      // 200 si ya tenía un reporte pendiente sobre lo mismo: no se creó otro.
      res.status(created ? 201 : 200).json({ id: report.id, status: report.status })
    }
  }
}
