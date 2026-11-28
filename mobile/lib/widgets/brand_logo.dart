import 'package:flutter/material.dart';

class BrandLogo extends StatelessWidget {
  final bool lightOnDark;
  final bool compact;

  const BrandLogo({super.key, this.lightOnDark = true, this.compact = false});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = lightOnDark
        ? Colors.white
        : (isDark ? const Color(0xFFECEFF4) : const Color(0xFF29378F));
    final subColor = lightOnDark
        ? Colors.white.withValues(alpha: 0.8)
        : (isDark ? const Color(0xFFA7B8FF) : const Color(0xFF5A6577));
    final size = compact ? 32.0 : 38.0;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(compact ? 9 : 11),
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF29378F), Color(0xFF4054B2)],
            ),
            border: Border.all(
              color: const Color(0xFFF58220).withValues(alpha: 0.9),
              width: 1.5,
            ),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFFF58220).withValues(alpha: 0.22),
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: CustomPaint(
            painter: _SemCrestPainter(),
          ),
        ),
        const SizedBox(width: 10),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'SEM',
              style: TextStyle(
                color: textColor,
                fontSize: compact ? 15 : 18,
                fontWeight: FontWeight.w900,
                letterSpacing: 1.4,
                height: 1.05,
              ),
            ),
            Text(
              'ENERGY MONITOR',
              style: TextStyle(
                color: subColor,
                fontSize: compact ? 8.5 : 9.5,
                fontWeight: FontWeight.w700,
                letterSpacing: 1.1,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _SemCrestPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final cx = size.width / 2;
    final cy = size.height / 2;
    final r = size.width * 0.34;

    final ringPaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.25)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.6;
    canvas.drawCircle(Offset(cx, cy), r, ringPaint);

    final boltPath = Path()
      ..moveTo(cx + size.width * 0.06, cy - size.height * 0.26)
      ..lineTo(cx - size.width * 0.14, cy + size.height * 0.02)
      ..lineTo(cx + size.width * 0.01, cy + size.height * 0.02)
      ..lineTo(cx - size.width * 0.06, cy + size.height * 0.26)
      ..lineTo(cx + size.width * 0.15, cy - size.height * 0.02)
      ..lineTo(cx - size.width * 0.01, cy - size.height * 0.02)
      ..close();

    final boltPaint = Paint()
      ..color = const Color(0xFFF58220)
      ..style = PaintingStyle.fill;
    canvas.drawPath(boltPath, boltPaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
