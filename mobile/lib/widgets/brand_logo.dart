import 'package:flutter/material.dart';
import '../core/theme/app_theme.dart';

class BrandLogo extends StatelessWidget {
  final bool lightOnDark;
  final bool compact;

  const BrandLogo({super.key, this.lightOnDark = true, this.compact = false});

  @override
  Widget build(BuildContext context) {
    final fg = lightOnDark ? Colors.white : SemColors.primary;
    final accent = lightOnDark ? SemColors.warning : SemColors.secondary;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: lightOnDark ? Colors.white.withValues(alpha: 0.14) : SemColors.lightCard,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: fg, width: 2),
          ),
          child: Icon(Icons.bolt_rounded, color: accent, size: 22),
        ),
        if (!compact) ...[
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'SMART ENERGY',
                style: TextStyle(
                  color: fg,
                  fontWeight: FontWeight.w800,
                  fontSize: 15,
                  letterSpacing: 0.4,
                ),
              ),
              Text(
                'MONITOR • TNEB',
                style: TextStyle(
                  color: lightOnDark ? Colors.white70 : SemColors.secondary,
                  fontWeight: FontWeight.w600,
                  fontSize: 10,
                  letterSpacing: 1.2,
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}
