<?php
/**
 * Same-origin proxy for the public Landrynki API.
 * Keeps the browser on rowerowy.otwartyplan.org; the upstream URL is fixed.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store, max-age=0');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    header('Allow: GET');
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$id = $_GET['id'] ?? null;
if ($id !== null && (!is_string($id) || !preg_match('/^[1-9][0-9]{0,9}$/D', $id))) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid Landrynki ID']);
    exit;
}

// Fixed HTTPS origin and path; no arbitrary target, no user-controlled host.
$url = 'https://lab.otwartyplan.org/wp-json/daroplan/v1/landrynki'
    . ($id === null ? '' : '/' . $id);
$payload = false;
$status = 0;

if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
        CURLOPT_USERAGENT => 'DaRoPlan/2.0 Landrynki public API proxy'
    ]);
    $payload = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
} else {
    $context = stream_context_create([
        'http' => ['method' => 'GET', 'timeout' => 15, 'follow_location' => 0,
            'header' => "Accept: application/json\r\nUser-Agent: DaRoPlan/2.0\r\n"],
        'ssl' => ['verify_peer' => true, 'verify_peer_name' => true]
    ]);
    $payload = @file_get_contents($url, false, $context);
    foreach ($http_response_header ?? [] as $line) {
        if (preg_match('~^HTTP/\\S+\\s+(\\d{3})~', $line, $matches)) $status = (int) $matches[1];
    }
}

$data = is_string($payload) ? json_decode($payload, true) : null;
$valid = $id === null
    ? (is_array($data) && array_is_list($data))
    : (is_array($data) && isset($data['routes']) && is_array($data['routes']));

if ($status !== 200 || !$valid) {
    error_log('[DaRoPlan Landrynki proxy] Failed upstream HTTP=' . $status .
        ' json=' . json_last_error_msg());
    http_response_code(502);
    echo json_encode(['error' => 'Landrynki API temporarily unavailable']);
    exit;
}

echo $payload;
