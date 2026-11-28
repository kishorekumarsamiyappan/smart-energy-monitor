import 'package:flutter/material.dart';

class SemColors {
  static const Color primary = Color(0xFF29378F);
  static const Color secondary = Color(0xFF4054B2);
  static const Color primaryDark = Color(0xFF8CA4FF);
  static const Color secondaryDark = Color(0xFFA7B8FF);
  static const Color lightCard = Color(0xFFE9EAF8);
  static const Color backgroundLight = Color(0xFFFFFFFF);
  static const Color surfaceLight = Color(0xFFF7F8FD);
  static const Color textLight = Color(0xFF273238);
  static const Color mutedLight = Color(0xFF5C6773);
  static const Color dividerLight = Color(0xFFAAB2B5);
  static const Color borderLight = Color(0xFFD4D9EA);

  static const Color backgroundDark = Color(0xFF0F1424);
  static const Color surfaceDark = Color(0xFF151C32);
  static const Color cardDark = Color(0xFF1F2847);
  static const Color textDark = Color(0xFFECEFF4);
  static const Color mutedDark = Color(0xFF9BA6C4);
  static const Color dividerDark = Color(0xFF35436B);

  static const Color success = Color(0xFF1B9E4B);
  static const Color warning = Color(0xFFF58220);
  static const Color error = Color(0xFFD93025);

  static Color accentPrimary(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark ? primaryDark : primary;

  static Color accentSecondary(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark ? secondaryDark : secondary;

  static Color mutedText(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark ? mutedDark : mutedLight;
}

class SemTheme {
  static ThemeData light() {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      scaffoldBackgroundColor: SemColors.backgroundLight,
      colorScheme: const ColorScheme.light(
        primary: SemColors.primary,
        secondary: SemColors.secondary,
        surface: SemColors.backgroundLight,
        error: SemColors.error,
        onPrimary: Colors.white,
        onSecondary: Colors.white,
        onSurface: SemColors.textLight,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: SemColors.primary,
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
      ),
      dividerColor: SemColors.dividerLight,
      cardTheme: CardThemeData(
        color: SemColors.backgroundLight,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: const BorderSide(color: SemColors.borderLight),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: SemColors.backgroundLight,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: SemColors.borderLight, width: 1.4),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: SemColors.borderLight, width: 1.4),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: SemColors.secondary, width: 1.8),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: SemColors.primary,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 13),
          textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: SemColors.primary,
          side: const BorderSide(color: SemColors.dividerLight, width: 1.4),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 13),
          textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
        ),
      ),
    );
  }

  static ThemeData dark() {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: SemColors.backgroundDark,
      colorScheme: const ColorScheme.dark(
        primary: SemColors.primaryDark,
        secondary: SemColors.secondaryDark,
        surface: SemColors.cardDark,
        error: Color(0xFFF26457),
        onPrimary: Colors.white,
        onSurface: SemColors.textDark,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: Color(0xFF172052),
        foregroundColor: Colors.white,
        elevation: 0,
      ),
      dividerColor: SemColors.dividerDark,
      cardTheme: CardThemeData(
        color: SemColors.cardDark,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: const BorderSide(color: SemColors.dividerDark),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: SemColors.surfaceDark,
        labelStyle: const TextStyle(color: SemColors.mutedDark),
        hintStyle: const TextStyle(color: SemColors.mutedDark),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: SemColors.dividerDark, width: 1.4),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: SemColors.dividerDark, width: 1.4),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: SemColors.secondaryDark, width: 1.8),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: SemColors.primary,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 13),
          textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: SemColors.primaryDark,
          side: const BorderSide(color: SemColors.dividerDark, width: 1.4),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 13),
          textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: SemColors.primaryDark,
          textStyle: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
    );
  }
}
