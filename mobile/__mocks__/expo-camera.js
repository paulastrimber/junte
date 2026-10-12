// Mock de expo-camera para jest. Por defecto NO hay permiso (el caso que la app tiene que tolerar siempre).
// `CameraView` es una vista vacía: los tests simulan una lectura con
// `fireEvent(screen.getByTestId('qr-camera'), 'barcodeScanned', { data: '…' })`.
const React = require('react')
const { View } = require('react-native')

module.exports = {
  Camera: { requestCameraPermissionsAsync: jest.fn(async () => ({ status: 'denied' })) },
  CameraView: (props) => React.createElement(View, props)
}
