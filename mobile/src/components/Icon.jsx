import Ionicons from '@expo/vector-icons/Ionicons'

import { sizes, useTheme } from '../theme/index.js'

/**
 * Ícono (Ionicons, variante de contorno salvo en el tab activo). Es decorativo: los lectores de pantalla lo
 * ignoran, así que el control que lo contiene siempre lleva su propio texto o `accessibilityLabel`.
 * @param {object} props
 * @param {string} props.name  Nombre de Ionicons ('calendar-outline', 'location-outline'…).
 * @param {number} [props.size]
 * @param {string} [props.color]  Rol de color del tema.
 */
export function Icon ({ name, size = sizes.iconMd, color = 'text', style }) {
  const { colors } = useTheme()
  return (
    <Ionicons
      name={name}
      size={size}
      color={colors[color]}
      style={style}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility='no'
    />
  )
}
