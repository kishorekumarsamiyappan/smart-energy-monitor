import 'package:intl/intl.dart';

class IstTimeUtils {
  static const Duration istOffset = Duration(hours: 5, minutes: 30);

  static DateTime toIst(DateTime utcOrLocal) {
    return utcOrLocal.toUtc().add(istOffset);
  }

  static String formatTimeIst(String? iso) {
    if (iso == null || iso.isEmpty) return '--:--:--';
    final parsed = DateTime.tryParse(iso);
    if (parsed == null) return '--:--:--';
    return DateFormat('hh:mm:ss a').format(toIst(parsed));
  }

  static String formatShortTimeIst(String? iso) {
    if (iso == null || iso.isEmpty) return '--:--';
    final parsed = DateTime.tryParse(iso);
    if (parsed == null) return '--:--';
    return DateFormat('hh:mm a').format(toIst(parsed));
  }

  static String formatDateIst(String? iso) {
    if (iso == null || iso.isEmpty) return '-';
    final parsed = DateTime.tryParse(iso);
    if (parsed == null) return iso;
    return DateFormat('dd MMM yyyy').format(toIst(parsed));
  }

  static String formatDateTimeIst(String? iso) {
    if (iso == null || iso.isEmpty) return '-';
    final parsed = DateTime.tryParse(iso);
    if (parsed == null) return iso;
    return '${DateFormat('dd MMM yyyy, hh:mm:ss a').format(toIst(parsed))} IST';
  }
}
