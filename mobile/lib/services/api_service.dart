import 'dart:convert';
import 'package:http/http.dart' as http;
import '../core/constants/app_constants.dart';

class ApiServiceException implements Exception {
  final int statusCode;
  final String message;

  const ApiServiceException(this.statusCode, this.message);

  @override
  String toString() => message;
}

class ApiService {
  final String baseUrl;

  ApiService({String? baseUrl}) : baseUrl = baseUrl ?? AppConstants.defaultApiBaseUrl;

  Future<Map<String, dynamic>> request(
    String method,
    String path, {
    String? token,
    Map<String, dynamic>? body,
  }) async {
    final uri = Uri.parse('$baseUrl$path');
    final headers = <String, String>{
      'Content-Type': 'application/json',
      if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
    };

    http.Response response;
    try {
      final encoded = body != null ? jsonEncode(body) : null;
      switch (method.toUpperCase()) {
        case 'GET':
          response = await http.get(uri, headers: headers).timeout(const Duration(seconds: 12));
        case 'POST':
          response = await http.post(uri, headers: headers, body: encoded).timeout(const Duration(seconds: 12));
        case 'PATCH':
          response = await http.patch(uri, headers: headers, body: encoded).timeout(const Duration(seconds: 12));
        case 'DELETE':
          response = await http.delete(uri, headers: headers).timeout(const Duration(seconds: 12));
        default:
          throw UnsupportedError('Unsupported HTTP method $method');
      }
    } catch (e) {
      throw ApiServiceException(0, 'Unable to reach Smart Energy Monitor server: $e');
    }

    final decoded = response.body.isNotEmpty
        ? jsonDecode(response.body) as Map<String, dynamic>
        : <String, dynamic>{};

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiServiceException(
        response.statusCode,
        decoded['error']?.toString() ?? 'Request failed (${response.statusCode})',
      );
    }
    return decoded;
  }
}
