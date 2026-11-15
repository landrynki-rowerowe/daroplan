<?php
/**
 * Plugin Name: DaRoPlan — Landrynki Rowerowe
 * Description: Edytor paczek tras GeoJSON i powiązanych filmów YouTube dla opowieści DaRoPlanu.
 * Version: 0.5.0
 */
if (!defined('ABSPATH')) { exit; }

function drp_lr_validate_geojson($raw) {
    if (strlen($raw) > 350000) return new WP_Error('size', 'GeoJSON jest zbyt duży (limit 350 kB).');
    $data = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE || !is_array($data) || ($data['type'] ?? '') !== 'FeatureCollection' || !isset($data['features']) || !is_array($data['features'])) {
        return new WP_Error('json', 'Wymagany jest poprawny GeoJSON typu FeatureCollection.');
    }
    if (count($data['features']) > 60) return new WP_Error('count', 'Maksymalnie 60 tras w paczce.');
    $ids = []; $out = [];
    foreach ($data['features'] as $i => $f) {
        $n = $i + 1;
        if (!is_array($f) || ($f['type'] ?? '') !== 'Feature' || ($f['geometry']['type'] ?? '') !== 'LineString') return new WP_Error('type', "Obiekt $n musi być linią LineString.");
        $p = $f['properties'] ?? [];
        $id = $p['id'] ?? '';
        $color = $p['color'] ?? '';
        if (!is_string($id) || !preg_match('/^[A-Za-z0-9_-]{1,70}$/D', $id)) return new WP_Error('id', "Obiekt $n: properties.id musi być unikalnym identyfikatorem (litery, cyfry, _ lub -).");
        if (isset($ids[$id])) return new WP_Error('duplicate', "Powtórzony identyfikator trasy: $id.");
        $ids[$id] = true;
        if (!is_string($color) || !preg_match('/^#[0-9a-fA-F]{6}$/D', $color)) return new WP_Error('color', "Trasa $id: properties.color musi mieć postać #RRGGBB.");
        $coords = $f['geometry']['coordinates'] ?? null;
        if (!is_array($coords) || count($coords) < 2 || count($coords) > 1000) return new WP_Error('coords', "Trasa $id: potrzeba od 2 do 1000 wierzchołków.");
        $clean = [];
        foreach ($coords as $point) {
            if (!is_array($point) || count($point) < 2 || !is_numeric($point[0]) || !is_numeric($point[1])) return new WP_Error('point', "Trasa $id: niepoprawny punkt.");
            $lon = (float) $point[0]; $lat = (float) $point[1];
            if (!is_finite($lon) || !is_finite($lat) || $lon < -180 || $lon > 180 || $lat < -90 || $lat > 90) return new WP_Error('range', "Trasa $id: współrzędne poza zakresem.");
            $clean[] = [$lon, $lat];
        }
        $out[] = ['type' => 'Feature', 'properties' => ['id' => $id, 'color' => strtoupper($color), 'name' => sanitize_text_field((string)($p['name'] ?? $id))], 'geometry' => ['type' => 'LineString', 'coordinates' => $clean]];
    }
    return ['type' => 'FeatureCollection', 'features' => $out];
}

function drp_lr_youtube_id($url) {
    $parts = wp_parse_url(trim($url));
    if (!is_array($parts) || strtolower($parts['scheme'] ?? '') !== 'https') return '';
    $host = strtolower($parts['host'] ?? ''); $path = $parts['path'] ?? ''; $id = '';
    if (in_array($host, ['youtu.be', 'www.youtu.be'], true)) $id = trim($path, '/');
    elseif (in_array($host, ['youtube.com', 'www.youtube.com', 'm.youtube.com'], true)) {
        if (preg_match('~^/(?:shorts|live|embed)/([^/]+)~', $path, $m)) $id = $m[1];
        elseif ($path === '/watch') { parse_str($parts['query'] ?? '', $q); $id = $q['v'] ?? ''; }
    }
    return is_string($id) && preg_match('/^[A-Za-z0-9_-]{11}$/D', $id) ? $id : '';
}

function drp_lr_validate_videos($raw, $geo) {
    $out = [];
    if (strlen($raw) > 20000) return new WP_Error('size', 'Lista filmów jest zbyt długa.');
    $allowed = array_fill_keys(array_column(array_column($geo['features'], 'properties'), 'id'), true);
    foreach (preg_split('/\r\n|\n|\r/', trim($raw)) as $i => $line) {
        if (trim($line) === '') continue;
        $pair = explode('|', $line, 2);
        if (count($pair) !== 2) return new WP_Error('syntax', 'Film w wierszu ' . ($i + 1) . ': użyj id_trasy | link_YouTube.');
        $id = trim($pair[0]); $url = trim($pair[1]);
        if (!isset($allowed[$id])) return new WP_Error('unknown', "Film przypisano do nieznanej trasy: $id.");
        if (isset($out[$id])) return new WP_Error('duplicate', "Trasa $id ma przypisane dwa filmy.");
        $yt = drp_lr_youtube_id($url);
        if (!$yt) return new WP_Error('youtube', "Trasa $id: niepoprawny adres YouTube (wymagany HTTPS).");
        $out[$id] = ['url' => esc_url_raw($url), 'youtube_id' => $yt];
    }
    return $out;
}

add_action('add_meta_boxes_drp_story', function () {
    add_meta_box('drp_lr_box', 'Landrynki Rowerowe — trasy i filmy', 'drp_lr_metabox', 'drp_story', 'normal', 'default');
});
function drp_lr_metabox($post) {
    $enabled = get_post_meta($post->ID, '_drp_lr_enabled', true) === '1';
    $geo = (string) get_post_meta($post->ID, '_drp_lr_geojson', true);
    $videos = (string) get_post_meta($post->ID, '_drp_lr_video_lines', true);
    wp_nonce_field('drp_lr_save', 'drp_lr_nonce');
    echo '<p><label><input type="checkbox" name="drp_lr_enabled" value="1" ' . checked($enabled, true, false) . '> <strong>Ta opowieść jest Landrynką Rowerową</strong></label></p>';
    echo '<p class="description">W geojson.io narysuj linie w kierunku jazdy. Każdej nadaj properties.id (np. trasa-czerwona), properties.color (np. #E34C54) i opcjonalnie properties.name. Wklej cały FeatureCollection. Trasy będą niewidoczne na mapie — posłużą do animacji.</p>';
    echo '<p><label for="drp_lr_geojson"><strong>GeoJSON tras</strong></label></p>';
    echo '<textarea id="drp_lr_geojson" name="drp_lr_geojson" rows="12" style="width:100%;font-family:monospace" spellcheck="false" placeholder="{&quot;type&quot;:&quot;FeatureCollection&quot;,&quot;features&quot;:[]}">' . esc_textarea($geo) . '</textarea>';
    echo '<p><label for="drp_lr_videos"><strong>Filmy YouTube — jeden na wiersz</strong></label></p>';
    echo '<textarea id="drp_lr_videos" name="drp_lr_videos" rows="6" style="width:100%;font-family:monospace" placeholder="trasa-czerwona | https://youtu.be/XXXXXXXXXXX">' . esc_textarea($videos) . '</textarea>';
    echo '<p class="description">Powiązanie odbywa się po ID trasy, nie po kolorze. Możesz zapisać szkic bez filmów. Po zapisaniu API udostępni jedynie opublikowane Landrynki.</p>';
    if ($enabled && $geo) {
        $parsed = drp_lr_validate_geojson($geo);
        if (is_wp_error($parsed)) echo '<p style="color:#b32d2e"><strong>Uwaga:</strong> ' . esc_html($parsed->get_error_message()) . '</p>';
        else {
            $map = drp_lr_validate_videos($videos, $parsed);
            if (is_wp_error($map)) echo '<p style="color:#b32d2e">' . esc_html($map->get_error_message()) . '</p>';
            else {
                echo '<p><strong>Trasy:</strong> ' . count($parsed['features']) . ' · <strong>Przypisane filmy:</strong> ' . count($map) . '</p>';
                echo '<ul style="margin-left:1em">';
                foreach ($parsed['features'] as $f) {
                    $p = $f['properties']; $id = $p['id'];
                    echo '<li><span style="display:inline-block;background:' . esc_attr($p['color']) . ';width:12px;height:12px;border-radius:50%;vertical-align:middle"></span> ' . esc_html($p['name']) . ' (' . esc_html($id) . ') — ' . (isset($map[$id]) ? 'film przypisany' : 'brak filmu') . '</li>';
                }
                echo '</ul>';
            }
        }
    }
}

add_action('save_post_drp_story', function ($post_id) {
    if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id) || !isset($_POST['drp_lr_nonce'])) return;
    $nonce = sanitize_text_field(wp_unslash($_POST['drp_lr_nonce']));
    if (!wp_verify_nonce($nonce, 'drp_lr_save') || !current_user_can('edit_post', $post_id)) return;
    $enabled = isset($_POST['drp_lr_enabled']);
    $raw_geo = isset($_POST['drp_lr_geojson']) ? trim((string) wp_unslash($_POST['drp_lr_geojson'])) : '';
    $raw_videos = isset($_POST['drp_lr_videos']) ? trim((string) wp_unslash($_POST['drp_lr_videos'])) : '';
    if ($enabled && $raw_geo !== '') {
        $geo = drp_lr_validate_geojson($raw_geo);
        if (is_wp_error($geo)) wp_die(esc_html($geo->get_error_message()), 'Landrynki — błąd GeoJSON', ['back_link' => true]);
        $videos = drp_lr_validate_videos($raw_videos, $geo);
        if (is_wp_error($videos)) wp_die(esc_html($videos->get_error_message()), 'Landrynki — błąd filmów', ['back_link' => true]);
        $raw_geo = wp_json_encode($geo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    } elseif ($enabled && $raw_videos !== '') {
        wp_die('Najpierw wklej GeoJSON, zanim przypiszesz filmy.', 'Landrynki — brak GeoJSON', ['back_link' => true]);
    }
    update_post_meta($post_id, '_drp_lr_enabled', $enabled ? '1' : '0');
    update_post_meta($post_id, '_drp_lr_geojson', $raw_geo);
    update_post_meta($post_id, '_drp_lr_video_lines', $raw_videos);
});

function drp_lr_public_payload($post) {
    $raw = (string) get_post_meta($post->ID, '_drp_lr_geojson', true);
    if (!$raw) return null;
    $geo = drp_lr_validate_geojson($raw);
    if (is_wp_error($geo) || empty($geo['features'])) return null;
    $videos = drp_lr_validate_videos((string) get_post_meta($post->ID, '_drp_lr_video_lines', true), $geo);
    if (is_wp_error($videos)) return null;
    $routes = [];
    foreach ($geo['features'] as $f) {
        $p = $f['properties']; $id = $p['id'];
        $routes[] = ['id' => $id, 'name' => $p['name'], 'color' => $p['color'], 'geometry' => $f['geometry'], 'video_url' => $videos[$id]['url'] ?? null, 'youtube_id' => $videos[$id]['youtube_id'] ?? null];
    }
    return ['id' => (int)$post->ID, 'title' => get_the_title($post), 'description_html' => apply_filters('the_content', $post->post_content), 'routes' => $routes];
}
add_action('rest_api_init', function () {
    register_rest_route('daroplan/v1', '/landrynki', [
        'methods' => WP_REST_Server::READABLE, 'permission_callback' => '__return_true',
        'callback' => function () {
            $posts = get_posts(['post_type' => 'drp_story', 'post_status' => 'publish', 'numberposts' => 200, 'meta_key' => '_drp_lr_enabled', 'meta_value' => '1']);
            $out = [];
            foreach ($posts as $p) {
                $payload = drp_lr_public_payload($p);
                if ($payload) $out[] = ['id' => $payload['id'], 'title' => $payload['title'], 'route_count' => count($payload['routes'])];
            }
            return rest_ensure_response($out);
        },
    ]);
    register_rest_route('daroplan/v1', '/landrynki/(?P<id>\d+)', [
        'methods' => WP_REST_Server::READABLE, 'permission_callback' => '__return_true',
        'callback' => function ($request) {
            $post = get_post(absint($request['id']));
            if (!$post || $post->post_type !== 'drp_story' || $post->post_status !== 'publish' || get_post_meta($post->ID, '_drp_lr_enabled', true) !== '1') return new WP_Error('not_found', 'Nie znaleziono opublikowanej Landrynki.', ['status' => 404]);
            $payload = drp_lr_public_payload($post);
            return $payload ? rest_ensure_response($payload) : new WP_Error('invalid', 'Landrynka nie ma poprawnych tras.', ['status' => 404]);
        },
    ]);
});
