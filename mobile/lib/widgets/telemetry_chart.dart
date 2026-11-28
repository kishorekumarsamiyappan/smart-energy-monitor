import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/time_utils.dart';

class ChartSeriesData {
  final String label;
  final String unit;
  final Color color;
  final List<(String timestamp, double value)> points;

  const ChartSeriesData({
    required this.label,
    required this.unit,
    required this.color,
    required this.points,
  });
}

class InteractiveTelemetryChart extends StatefulWidget {
  final List<ChartSeriesData> series;
  final bool showMinMax;

  const InteractiveTelemetryChart({
    super.key,
    required this.series,
    this.showMinMax = true,
  });

  @override
  State<InteractiveTelemetryChart> createState() => _InteractiveTelemetryChartState();
}

class _InteractiveTelemetryChartState extends State<InteractiveTelemetryChart> {
  RangeValues _range = const RangeValues(0, 100);
  int? _selectedIndex;

  @override
  Widget build(BuildContext context) {
    final baseLen = widget.series.isNotEmpty ? widget.series.first.points.length : 0;
    if (baseLen == 0) {
      return Container(
        height: 220,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          border: Border.all(color: Theme.of(context).dividerColor),
          borderRadius: BorderRadius.circular(12),
        ),
        child: const Text('No telemetry points available for selected range.'),
      );
    }

    final startIdx = ((_range.start / 100) * (baseLen - 1)).floor().clamp(0, baseLen - 1);
    final endIdx = ((_range.end / 100) * baseLen).ceil().clamp(startIdx + 1, baseLen);

    final sliced = widget.series
        .map((s) => ChartSeriesData(
              label: s.label,
              unit: s.unit,
              color: s.color,
              points: s.points.sublist(startIdx, math.min(endIdx, s.points.length)),
            ))
        .toList();

    final activeLen = sliced.first.points.length;
    final hoverIdx = (_selectedIndex != null && _selectedIndex! < activeLen) ? _selectedIndex : null;

    return Column(
      children: [
        GestureDetector(
          onTapDown: (d) => _updateSelection(d.localPosition.dx, context.size?.width ?? 320, activeLen),
          onHorizontalDragUpdate: (d) =>
              _updateSelection(d.localPosition.dx, context.size?.width ?? 320, activeLen),
          child: SizedBox(
            height: 250,
            width: double.infinity,
            child: CustomPaint(
              painter: _TelemetryChartPainter(
                series: sliced,
                showMinMax: widget.showMinMax,
                selectedIndex: hoverIdx,
                textColor: Theme.of(context).colorScheme.onSurface,
                gridColor: Theme.of(context).dividerColor.withValues(alpha: 0.45),
                cardBg: Theme.of(context).cardTheme.color ?? Colors.white,
                accentPrimary: SemColors.accentPrimary(context),
              ),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Text(
              IstTimeUtils.formatShortTimeIst(sliced.first.points.first.$1),
              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
            ),
            Expanded(
              child: RangeSlider(
                values: _range,
                min: 0,
                max: 100,
                activeColor: SemColors.accentSecondary(context),
                onChanged: (v) {
                  if (v.end - v.start >= 10) {
                    setState(() {
                      _range = v;
                      _selectedIndex = null;
                    });
                  }
                },
              ),
            ),
            Text(
              IstTimeUtils.formatShortTimeIst(sliced.first.points.last.$1),
              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Wrap(
          spacing: 14,
          runSpacing: 6,
          alignment: WrapAlignment.center,
          children: [
            for (final s in sliced)
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(width: 10, height: 10, decoration: BoxDecoration(color: s.color, shape: BoxShape.circle)),
                  const SizedBox(width: 5),
                  Text(s.label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                ],
              ),
            if (widget.showMinMax) ...[
              const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircleAvatar(radius: 5, backgroundColor: SemColors.warning),
                  SizedBox(width: 5),
                  Text('Min', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                ],
              ),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircleAvatar(radius: 5, backgroundColor: SemColors.accentPrimary(context)),
                  const SizedBox(width: 5),
                  const Text('Max', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                ],
              ),
            ],
          ],
        ),
      ],
    );
  }

  void _updateSelection(double dx, double width, int len) {
    if (len <= 1) return;
    const padLeft = 44.0;
    const padRight = 14.0;
    final plotW = math.max(1.0, width - padLeft - padRight);
    final norm = ((dx - padLeft) / plotW).clamp(0.0, 1.0);
    setState(() => _selectedIndex = (norm * (len - 1)).round());
  }
}

class _TelemetryChartPainter extends CustomPainter {
  final List<ChartSeriesData> series;
  final bool showMinMax;
  final int? selectedIndex;
  final Color textColor;
  final Color gridColor;
  final Color cardBg;
  final Color accentPrimary;

  _TelemetryChartPainter({
    required this.series,
    required this.showMinMax,
    required this.selectedIndex,
    required this.textColor,
    required this.gridColor,
    required this.cardBg,
    required this.accentPrimary,
  });

  @override
  void paint(Canvas canvas, Size size) {
    const padLeft = 44.0;
    const padRight = 14.0;
    const padTop = 26.0;
    const padBottom = 30.0;
    final plotW = size.width - padLeft - padRight;
    final plotH = size.height - padTop - padBottom;

    var minY = double.infinity;
    var maxY = double.negativeInfinity;
    for (final s in series) {
      for (final p in s.points) {
        minY = math.min(minY, p.$2);
        maxY = math.max(maxY, p.$2);
      }
    }
    if (!minY.isFinite || !maxY.isFinite) {
      minY = 0;
      maxY = 100;
    } else if ((maxY - minY).abs() < 1e-6) {
      minY = math.max(0, minY - 5);
      maxY = maxY + 5;
    } else {
      final pad = (maxY - minY) * 0.14;
      minY = math.max(0, minY - pad);
      maxY = maxY + pad;
    }

    double toX(int idx, int len) => len <= 1 ? padLeft + plotW / 2 : padLeft + (idx / (len - 1)) * plotW;
    double toY(double v) => padTop + plotH - ((v - minY) / math.max(1e-6, maxY - minY)) * plotH;

    final gridPaint = Paint()
      ..color = gridColor
      ..strokeWidth = 1;

    // Unit header
    _drawText(canvas, '(${series.first.unit})', const Offset(4, 4), textColor.withValues(alpha: 0.7), 11, FontWeight.w700);

    // Y Gridlines
    for (var i = 0; i <= 4; i++) {
      final v = minY + ((maxY - minY) * i) / 4;
      final y = toY(v);
      canvas.drawLine(Offset(padLeft, y), Offset(size.width - padRight, y), gridPaint);
      _drawText(
        canvas,
        v >= 100 ? v.round().toString() : v.toStringAsFixed(1),
        Offset(2, y - 7),
        textColor.withValues(alpha: 0.65),
        10,
        FontWeight.w500,
      );
    }

    // X Ticks
    final len = series.first.points.length;
    final ticks = len <= 3 ? List.generate(len, (i) => i) : [0, len ~/ 3, (len * 2) ~/ 3, len - 1];
    for (final idx in ticks) {
      final x = toX(idx, len);
      final label = IstTimeUtils.formatShortTimeIst(series.first.points[idx].$1);
      _drawText(canvas, label, Offset((x - 22).clamp(padLeft, size.width - 54), size.height - 18),
          textColor.withValues(alpha: 0.65), 10, FontWeight.w500);
    }

    // Lines & Min/Max markers
    for (final s in series) {
      if (s.points.isEmpty) continue;
      final path = Path();
      var minIdx = 0;
      var maxIdx = 0;
      for (var i = 0; i < s.points.length; i++) {
        final pt = Offset(toX(i, s.points.length), toY(s.points[i].$2));
        if (i == 0) {
          path.moveTo(pt.dx, pt.dy);
        } else {
          path.lineTo(pt.dx, pt.dy);
        }
        if (s.points[i].$2 < s.points[minIdx].$2) minIdx = i;
        if (s.points[i].$2 > s.points[maxIdx].$2) maxIdx = i;
      }
      canvas.drawPath(
        path,
        Paint()
          ..color = s.color
          ..strokeWidth = 2.4
          ..style = PaintingStyle.stroke,
      );

      if (showMinMax && s.points.length > 2) {
        final minPt = Offset(toX(minIdx, s.points.length), toY(s.points[minIdx].$2));
        final maxPt = Offset(toX(maxIdx, s.points.length), toY(s.points[maxIdx].$2));
        canvas.drawCircle(minPt, 4.5, Paint()..color = SemColors.warning);
        canvas.drawCircle(maxPt, 4.5, Paint()..color = accentPrimary);
        _drawText(canvas, '${s.points[minIdx].$2} ${s.unit}', minPt.translate(-18, -16), textColor, 10, FontWeight.w700);
        _drawText(canvas, '${s.points[maxIdx].$2} ${s.unit}', maxPt.translate(-18, -16), textColor, 10, FontWeight.w700);
      }
    }

    if (selectedIndex != null && selectedIndex! < len) {
      final cx = toX(selectedIndex!, len);
      canvas.drawLine(
        Offset(cx, padTop),
        Offset(cx, size.height - padBottom),
        Paint()
          ..color = textColor.withValues(alpha: 0.4)
          ..strokeWidth = 1.2,
      );
      final boxLeft = (cx - 75).clamp(padLeft + 4, size.width - 158);
      final boxRect = RRect.fromRectAndRadius(
        Rect.fromLTWH(boxLeft, padTop + 4, 150, 22.0 + series.length * 16),
        const Radius.circular(8),
      );
      canvas.drawRRect(boxRect, Paint()..color = cardBg);
      canvas.drawRRect(
        boxRect,
        Paint()
          ..color = gridColor
          ..style = PaintingStyle.stroke,
      );
      _drawText(
        canvas,
        'Time: ${IstTimeUtils.formatTimeIst(series.first.points[selectedIndex!].$1)}',
        Offset(boxLeft + 8, padTop + 8),
        textColor,
        10,
        FontWeight.w700,
      );
      for (var si = 0; si < series.length; si++) {
        final s = series[si];
        _drawText(
          canvas,
          '${s.label}: ${s.points[selectedIndex!].$2} ${s.unit}',
          Offset(boxLeft + 8, padTop + 24.0 + si * 16),
          s.color,
          10,
          FontWeight.w600,
        );
      }
    }
  }

  void _drawText(Canvas canvas, String text, Offset offset, Color color, double size, FontWeight weight) {
    final tp = TextPainter(
      text: TextSpan(text: text, style: TextStyle(color: color, fontSize: size, fontWeight: weight)),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, offset);
  }

  @override
  bool shouldRepaint(covariant _TelemetryChartPainter oldDelegate) => true;
}
