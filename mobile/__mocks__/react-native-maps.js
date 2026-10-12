// Mock de react-native-maps para jest (el módulo nativo no existe en los tests). Jest lo aplica solo por estar en
// `__mocks__/` junto a node_modules. MapView y Marker son Views que conservan sus props: los tests disparan
// `onPress` / `onDragEnd` con `{ nativeEvent: { coordinate } }`, igual que el mapa real.
const { createElement } = require('react')
const { View } = require('react-native')

function MapView ({ children, ...props }) {
  return createElement(View, props, children)
}

function Marker (props) {
  return createElement(View, props)
}

module.exports = { __esModule: true, default: MapView, Marker }
