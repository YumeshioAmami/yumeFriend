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
                onPrimary = Color.White,
                onBackground = Color(0xFF2C2823),
                onSurface = Color(0xFF2C2823),
            )
        }
    }
}
