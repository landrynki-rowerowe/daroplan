<?php
/** DaRoPlan: public GeoJSON ZTP via same-origin PHP. No user-supplied URL. */
declare(strict_types=1);
header('Content-Type: application/geo+json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: public, max-age=300');
$url = 'https://ztp.krakow.pl/dane/audyty.geojson';
$cache = sys_get_temp_dir() . '/daroplan_ztp_audyty_' . hash('sha256', __DIR__) . '.json';
$ttl = 1800;
$valid = static function (string $body): bool {
    $geo = json_decode($body, true);
    return is_array($geo) && ($geo['type'] ?? '') === 'FeatureCollection'
        && isset($geo['features']) && is_array($geo['features']) && count($geo['features']) > 10;
};
$cached = is_file($cache) ? @file_get_contents($cache) : false;
if (is_string($cached) && $valid($cached) && time() - (int)filemtime($cache) < $ttl) {
    header('X-DaRoPlan-Source: cache'); echo $cached; exit;
}
$remote = false;
if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER=>true, CURLOPT_CONNECTTIMEOUT=>6,
      CURLOPT_TIMEOUT=>18, CURLOPT_FOLLOWLOCATION=>false, CURLOPT_SSL_VERIFYPEER=>true,
      CURLOPT_USERAGENT=>'DaRoPlan/0.8.2 (https://rowerowy.otwartyplan.org/mapa/)']);
    $result = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($status === 200 && is_string($result)) $remote = $result;
} else {
    $ctx = stream_context_create(['http'=>['timeout'=>18,'follow_location'=>0,
      'header'=>"User-Agent: DaRoPlan/0.8.2\r\n"], 'ssl'=>['verify_peer'=>true,'verify_peer_name'=>true]]);
    $remote = @file_get_contents($url, false, $ctx);
}
if (is_string($remote) && $valid($remote)) {
    @file_put_contents($cache, $remote, LOCK_EX);
    header('X-DaRoPlan-Source: ztp'); echo $remote; exit;
}
if (is_string($cached) && $valid($cached) && time() - (int)filemtime($cache) < 7*86400) {
    header('X-DaRoPlan-Source: stale-cache'); echo $cached; exit;
}
http_response_code(502);
echo json_encode(['error'=>'Nie mozna pobrac aktualnych danych ZTP'], JSON_UNESCAPED_UNICODE);
