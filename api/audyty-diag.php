<?php
/** Temporary diagnostic: remove from hosting after checking. No secrets or full headers. */
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
$url = 'https://ztp.krakow.pl/dane/audyty.geojson';
$out = ['php_version' => PHP_VERSION, 'curl_available' => function_exists('curl_init')];
if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 22,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 3,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_ENCODING => '',
        CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; DaRoPlan/0.8; +https://rowerowy.otwartyplan.org/)',
    ]);
    $body = curl_exec($ch);
    $out['http_code'] = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $out['curl_errno'] = curl_errno($ch);
    $out['curl_error'] = curl_error($ch);
    $out['content_type'] = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    curl_close($ch);
    if (is_string($body)) {
        $data = json_decode(ltrim($body, "\xEF\xBB\xBF"), true);
        $out['bytes'] = strlen($body);
        $out['json_error'] = json_last_error_msg();
        $out['feature_collection'] = is_array($data) && ($data['type'] ?? '') === 'FeatureCollection';
        $out['features_count'] = is_array($data['features'] ?? null) ? count($data['features']) : null;
    }
} else {
    $out['allow_url_fopen'] = (bool)ini_get('allow_url_fopen');
    $ctx = stream_context_create(['http' => ['timeout' => 20, 'follow_location' => 1, 'max_redirects' => 3, 'header' => "User-Agent: DaRoPlan/0.8\r\n"], 'ssl' => ['verify_peer' => true, 'verify_peer_name' => true]]);
    $body = @file_get_contents($url, false, $ctx);
    $out['stream_success'] = is_string($body);
    $out['http_status_line'] = $http_response_header[0] ?? null;
    if (is_string($body)) {
        $data = json_decode(ltrim($body, "\xEF\xBB\xBF"), true);
        $out['feature_collection'] = is_array($data) && ($data['type'] ?? '') === 'FeatureCollection';
        $out['features_count'] = is_array($data['features'] ?? null) ? count($data['features']) : null;
    }
}
echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_INVALID_UTF8_SUBSTITUTE);
