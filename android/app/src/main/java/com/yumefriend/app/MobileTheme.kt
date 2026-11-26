package com.yumefriend.app

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color

data class AppTheme(
    val color: String = "paper",
    val mode: String = "light",
)

fun AppTheme.scheme(): ColorScheme {
    val dark = mode == "dark"
    return when (color) {
        "moss" -> if (dark) {
            darkColorScheme(
                primary = Color(0xFF9DBE95),
                secondary = Color(0xFF6E8068),
                background = Color(0xFF171E18),
                surface = Color(0xFF202A21),
                surfaceVariant = Color(0xFF2B372C),
                outline = Color(0xFF425544),
                outlineVariant = Color(0xFF536857),
                onSurfaceVariant = Color(0xFFA8B8A4),
                primaryContainer = Color(0xFF29392B),
                secondaryContainer = Color(0xFF29392B),
                onPrimary = Color(0xFF172018),
                onBackground = Color(0xFFE6F0E4),
                onSurface = Color(0xFFE6F0E4),
            )
        } else {
            lightColorScheme(
                primary = Color(0xFF687F5D),
                secondary = Color(0xFF809474),
                background = Color(0xFFEEF2E8),
                surface = Color(0xFFFBFDF8),
                surfaceVariant = Color(0xFFE0E8D8),
                outline = Color(0xFFC7D2BD),
                outlineVariant = Color(0xFFB7C5AB),
                onSurfaceVariant = Color(0xFF71806C),
                primaryContainer = Color(0xFFDDE8D6),
                secondaryContainer = Color(0xFFDDE8D6),
                onPrimary = Color.White,
                onBackground = Color(0xFF243024),
                onSurface = Color(0xFF243024),
            )
        }
        "tea" -> if (dark) {
            darkColorScheme(
                primary = Color(0xFFD19A72),
                secondary = Color(0xFFA47758),
                background = Color(0xFF201A16),
                surface = Color(0xFF2B231D),
                surfaceVariant = Color(0xFF382D25),
                outline = Color(0xFF514035),
                outlineVariant = Color(0xFF66503E),
                onSurfaceVariant = Color(0xFFBEA995),
                primaryContainer = Color(0xFF392B22),
                secondaryContainer = Color(0xFF392B22),
                onPrimary = Color(0xFF201710),
                onBackground = Color(0xFFF0E4D8),
                onSurface = Color(0xFFF0E4D8),
            )
        } else {
            lightColorScheme(
                primary = Color(0xFF946348),
                secondary = Color(0xFFB28367),
                background = Color(0xFFF3EEE7),
                surface = Color(0xFFFFFAF3),
                surfaceVariant = Color(0xFFE8DED1),
                outline = Color(0xFFD4C4B2),
                outlineVariant = Color(0xFFC7B39D),
                onSurfaceVariant = Color(0xFF8F7D6B),
                primaryContainer = Color(0xFFEEE0D2),
                secondaryContainer = Color(0xFFEEE0D2),
                onPrimary = Color.White,
                onBackground = Color(0xFF332A22),
                onSurface = Color(0xFF332A22),
            )
        }
        "sakura" -> if (dark) {
            darkColorScheme(
                primary = Color(0xFFD48A9F),
                secondary = Color(0xFFA76C7C),
                background = Color(0xFF21191C),
                surface = Color(0xFF2C2226),
                surfaceVariant = Color(0xFF392A30),
                outline = Color(0xFF543D45),
                outlineVariant = Color(0xFF6B4D57),
                onSurfaceVariant = Color(0xFFC0A5AD),
                primaryContainer = Color(0xFF3D282F),
                secondaryContainer = Color(0xFF3D282F),
                onPrimary = Color(0xFF2A151B),
                onBackground = Color(0xFFF3E6EA),
                onSurface = Color(0xFFF3E6EA),
            )
        } else {
            lightColorScheme(
                primary = Color(0xFFB05C73),
                secondary = Color(0xFFC78394),
                background = Color(0xFFF8F0F1),
                surface = Color(0xFFFFFAFB),
                surfaceVariant = Color(0xFFF0DFE3),
                outline = Color(0xFFDDC5CB),
                outlineVariant = Color(0xFFD1B5BD),
                onSurfaceVariant = Color(0xFF9B7E86),
                primaryContainer = Color(0xFFF3DFE5),
                secondaryContainer = Color(0xFFF3DFE5),
                onPrimary = Color.White,
                onBackground = Color(0xFF35272B),
                onSurface = Color(0xFF35272B),
            )
        }
        else -> if (dark) {
            darkColorScheme(
                primary = Color(0xFFDF8D7C),
                secondary = Color(0xFFB9786A),
                background = Color(0xFF1E1B17),
                surface = Color(0xFF29241E),
                surfaceVariant = Color(0xFF342D25),
                outline = Color(0xFF4A4034),
                outlineVariant = Color(0xFF5C4E3E),
                onSurfaceVariant = Color(0xFFB7A993),
                primaryContainer = Color(0xFF3B2B25),
                secondaryContainer = Color(0xFF3B2B25),
                onPrimary = Color(0xFF24120F),
                onBackground = Color(0xFFF2EADC),
                onSurface = Color(0xFFF2EADC),
            )
        } else {
            lightColorScheme(
                primary = Color(0xFFA34F40),
                secondary = Color(0xFFBC7668),
                background = Color(0xFFFBF7F0),
                surface = Color(0xFFFFFDF9),
                surfaceVariant = Color(0xFFF4ECE1),
                outline = Color(0xFFE6DBC9),
                outlineVariant = Color(0xFFD8CBB7),
                onSurfaceVariant = Color(0xFF968B7D),
                primaryContainer = Color(0xFFF3E4DF),
                secondaryContainer = Color(0xFFF3E4DF),
                onPrimary = Color.White,
                onBackground = Color(0xFF2C2823),
                onSurface = Color(0xFF2C2823),
            )
        }
    }
}
