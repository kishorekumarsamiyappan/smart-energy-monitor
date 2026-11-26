import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../core/theme/app_theme.dart';

class SemStatusBadge extends StatelessWidget {
  final String label;
  final Color color;

  const SemStatusBadge({super.key, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

class DashedDivider extends StatelessWidget {
  final Color? color;
  const DashedDivider({super.key, this.color});

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: const Size(double.infinity, 1.5),
      painter: _DashedLinePainter(color ?? Theme.of(context).dividerColor),
    );
  }
}

class _DashedLinePainter extends CustomPainter {
  final Color color;
  _DashedLinePainter(this.color);

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1.3;
    const dashWidth = 5.0;
    const dashSpace = 4.0;
    double startX = 0;
    while (startX < size.width) {
      canvas.drawLine(Offset(startX, 0), Offset(startX + dashWidth, 0), paint);
      startX += dashWidth + dashSpace;
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class PowerGaugeArcWidget extends StatelessWidget {
  final double valueW;
  final double maxW;

  const PowerGaugeArcWidget({super.key, required this.valueW, this.maxW = 7000});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        CustomPaint(
          size: const Size(74, 44),
          painter: _ArcGaugePainter(
            ratio: (valueW / maxW).clamp(0.0, 1.0),
            trackColor: Theme.of(context).dividerColor.withValues(alpha: 0.35),
            needleColor: Theme.of(context).colorScheme.onSurface,
          ),
        ),
        const SizedBox(width: 8),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Active Power',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: Theme.of(context).textTheme.bodySmall?.color?.withValues(alpha: 0.72),
              ),
            ),
            Text(
              '${valueW.toStringAsFixed(0)} W',
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
            ),
          ],
        ),
      ],
    );
  }
}

class _ArcGaugePainter extends CustomPainter {
  final double ratio;
  final Color trackColor;
  final Color needleColor;

  _ArcGaugePainter({
    required this.ratio,
    required this.trackColor,
    required this.needleColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height - 6);
    const radius = 26.0;
    final rect = Rect.fromCircle(center: center, radius: radius);

    final trackPaint = Paint()
      ..color = trackColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = 5.5
      ..strokeCap = StrokeCap.round;

    final activePaint = Paint()
      ..color = SemColors.warning
      ..style = PaintingStyle.stroke
      ..strokeWidth = 5.5
      ..strokeCap = StrokeCap.round;

    canvas.drawArc(rect, math.pi, math.pi, false, trackPaint);
    canvas.drawArc(rect, math.pi, math.pi * ratio, false, activePaint);

    final angle = math.pi + math.pi * ratio;
    final tip = Offset(
      center.dx + (radius - 6) * math.cos(angle),
      center.dy + (radius - 6) * math.sin(angle),
    );
    canvas.drawLine(
      center,
      tip,
      Paint()
        ..color = needleColor
        ..strokeWidth = 2.0
        ..strokeCap = StrokeCap.round,
    );
    canvas.drawCircle(center, 3.0, Paint()..color = needleColor);
  }

  @override
  bool shouldRepaint(covariant _ArcGaugePainter oldDelegate) => oldDelegate.ratio != ratio;
}

class SegmentedPillTabs<T> extends StatelessWidget {
  final List<(T, String)> tabs;
  final T active;
  final ValueChanged<T> onChanged;

  const SegmentedPillTabs({
    super.key,
    required this.tabs,
    required this.active,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: isDark ? SemColors.cardDark : SemColors.lightCard,
        borderRadius: BorderRadius.circular(12),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: tabs.map((tab) {
            final selected = tab.$1 == active;
            return GestureDetector(
              onTap: () => onChanged(tab.$1),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: selected ? SemColors.primary : Colors.transparent,
                  borderRadius: BorderRadius.circular(9),
                ),
                child: Text(
                  tab.$2,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: selected
                        ? Colors.white
                        : (isDark ? SemColors.textDark : SemColors.primary),
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }
}

class TiltedAddFab extends StatelessWidget {
  final VoidCallback onPressed;
  const TiltedAddFab({super.key, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return Transform.rotate(
      angle: -0.14,
      child: FloatingActionButton(
        onPressed: onPressed,
        backgroundColor: SemColors.primary,
        foregroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        child: Transform.rotate(
          angle: 0.14,
          child: const Icon(Icons.add, size: 28),
        ),
      ),
    );
  }
}
