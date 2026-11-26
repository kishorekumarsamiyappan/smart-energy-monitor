import 'dart:io';
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:share_plus/share_plus.dart';
import '../core/utils/time_utils.dart';
import '../models/models.dart';

class ReportExportService {
  static String buildTelemetryCsv(String deviceId, List<TelemetryPointModel> points) {
    final buf = StringBuffer(
      'Device ID,Timestamp (Asia/Kolkata),Voltage (V),Current (A),Active Power (W),Apparent Power (VA),Power Factor,Frequency (Hz),Energy (kWh)\n',
    );
    for (final p in points) {
      buf.writeln(
        '$deviceId,"${IstTimeUtils.formatDateTimeIst(p.ingestedAt)}",'
        '${p.voltageRms.toStringAsFixed(2)},'
        '${p.currentRms.toStringAsFixed(3)},'
        '${p.activePowerW.toStringAsFixed(2)},'
        '${p.apparentPowerVa.toStringAsFixed(2)},'
        '${p.powerFactor.toStringAsFixed(3)},'
        '${p.frequencyHz.toStringAsFixed(2)},'
        '${p.energyKwh.toStringAsFixed(4)}',
      );
    }
    return buf.toString();
  }

  static Future<File> generatePdfFile({
    required String deviceId,
    required String title,
    required List<TelemetryPointModel> points,
    bool isDemo = false,
  }) async {
    final doc = pw.Document();
    doc.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4,
        build: (ctx) => [
          pw.Container(
            padding: const pw.EdgeInsets.all(14),
            color: PdfColor.fromInt(0xFF29378F),
            child: pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Text('SMART ENERGY MONITOR',
                    style: pw.TextStyle(color: PdfColors.white, fontSize: 16, fontWeight: pw.FontWeight.bold)),
                pw.Text('$title • $deviceId${isDemo ? " [DEMO]" : ""}',
                    style: const pw.TextStyle(color: PdfColors.white, fontSize: 10)),
              ],
            ),
          ),
          pw.SizedBox(height: 12),
          pw.Text('Generated: ${IstTimeUtils.formatDateTimeIst(DateTime.now().toUtc().toIso8601String())}'),
          pw.SizedBox(height: 10),
          pw.TableHelper.fromTextArray(
            headers: const ['Time (IST)', 'V', 'A', 'W', 'PF', 'Hz', 'kWh'],
            data: points
                .take(60)
                .map((p) => [
                      IstTimeUtils.formatTimeIst(p.ingestedAt),
                      p.voltageRms.toStringAsFixed(1),
                      p.currentRms.toStringAsFixed(2),
                      p.activePowerW.toStringAsFixed(0),
                      p.powerFactor.toStringAsFixed(2),
                      p.frequencyHz.toStringAsFixed(2),
                      p.energyKwh.toStringAsFixed(2),
                    ])
                .toList(),
          ),
        ],
      ),
    );

    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/sem_report_$deviceId.pdf');
    await file.writeAsBytes(await doc.save());
    return file;
  }

  static Future<void> shareCsv(String deviceId, List<TelemetryPointModel> points) async {
    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/sem_report_$deviceId.csv');
    await file.writeAsString(buildTelemetryCsv(deviceId, points));
    await Share.shareXFiles([XFile(file.path)], text: 'Smart Energy Monitor CSV Report ($deviceId)');
  }

  static Future<void> sharePdf(String deviceId, String title, List<TelemetryPointModel> points, bool isDemo) async {
    final file = await generatePdfFile(deviceId: deviceId, title: title, points: points, isDemo: isDemo);
    await Share.shareXFiles([XFile(file.path)], text: 'Smart Energy Monitor PDF Report ($deviceId)');
  }
}
