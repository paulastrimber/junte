// Mock de react-native-qrcode-svg para jest: una vista con el contenido del QR como etiqueta accesible.
const React = require('react')
const { View } = require('react-native')

module.exports = function QRCode ({ value, size }) {
  return React.createElement(View, { testID: 'qr-code', accessibilityLabel: value, style: { width: size, height: size } })
}
