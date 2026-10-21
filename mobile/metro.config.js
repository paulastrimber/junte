// Configuración de Metro: la de Expo, con `inlineRequires`. Así cada módulo se evalúa la primera vez que se usa y no
// al arrancar: el mapa, la cámara y el QR (con su parser de SVG) no frenan el primer frame si no se abren.
// Ojo con los efectos de nivel módulo (`configureApiAuth` en App.jsx, `onSessionEnded` en services/socket.js): corren
// cuando se usa algo de su módulo, que es lo que necesitan.
// CommonJS porque Metro lo carga con `require`.
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

const expoTransformOptions = config.transformer.getTransformOptions
config.transformer.getTransformOptions = async (...args) => {
  const options = await expoTransformOptions(...args)
  return { ...options, transform: { ...options.transform, inlineRequires: true } }
}

module.exports = config
