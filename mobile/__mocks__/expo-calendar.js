// Mock de expo-calendar para jest. Por defecto NO hay permiso; cada test configura lo que necesita.
module.exports = {
  EntityTypes: { EVENT: 'event', REMINDER: 'reminder' },
  requestCalendarPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  getCalendarsAsync: jest.fn(async () => []),
  getEventsAsync: jest.fn(async () => [])
}
