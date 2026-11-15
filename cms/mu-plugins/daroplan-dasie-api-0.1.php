<?php
/**
 * Plugin Name: DaRoPlan — DASIE REST GeoJSON
 * Description: Publiczny, tylko do odczytu endpoint GeoJSON opublikowanych wpisów DASIE.
 * Version: 0.1.0
 */
if (!defined('ABSPATH')) exit;

add_action('rest_api_init', function () {
    register_rest_route('daroplan/v1', '/dasie', [
        'methods' => WP_REST_Server::READABLE,
        'permission_callback' => '__return_true',
        'args' => [
            'page' => ['default' => 1, 'sanitize_callback' => 'absint', 'validate_callback' => function ($v) { return is_numeric($v) && (int)$v >= 1; }],
            'per_page' => ['default' => 500, 'sanitize_callback' => 'absint', 'validate_callback' => function ($v) { return is_numeric($v) && (int)$v >= 1 && (int)$v <= 500; }],
        ],
        'callback' => 'drp_dasie_geojson_endpoint',
    ]);
});

function drp_dasie_geojson_endpoint($request) {
    global $wpdb;
    $page = max(1, (int)$request->get_param('page'));
    $per_page = max(1, min(500, (int)$request->get_param('per_page')));
    $posts = new WP_Query([
        'post_type' => 'drp_dasie', 'post_status' => 'publish',
        'posts_per_page' => $per_page, 'paged' => $page,
        'orderby' => 'ID', 'order' => 'ASC', 'no_found_rows' => false,
        'ignore_sticky_posts' => true,
    ]);
    $geo_table = $wpdb->prefix . 'drp_geometries';
    $rel_table = $wpdb->prefix . 'drp_dasie_geometry';
    $features = [];
    $ids = wp_list_pluck($posts->posts, 'ID');
    $geometries_by_post = [];
    if ($ids) {
        $placeholders = implode(',', array_fill(0, count($ids), '%d'));
        // Nazwy tabel pochodzą wyłącznie z zaufanego prefiksu WordPressa.
        $sql = "SELECT r.dasie_id, g.id AS geometry_id, g.title AS geometry_title, g.geometry_json
                FROM `$rel_table` r INNER JOIN `$geo_table` g ON g.id = r.geometry_id
                WHERE r.dasie_id IN ($placeholders) ORDER BY r.dasie_id, g.id";
        $rows = $wpdb->get_results($wpdb->prepare($sql, $ids));
        if ($wpdb->last_error) {
            return new WP_Error('drp_dasie_db', 'Nie udało się odczytać geometrii DASIE.', ['status' => 500]);
        }
        foreach ($rows as $row) $geometries_by_post[(int)$row->dasie_id][] = $row;
    }
    foreach ($posts->posts as $post) {
        $post_id = (int)$post->ID;
        $platform = (string)get_post_meta($post_id, '_drp_dasie_platform', true);
        $external_id = (string)get_post_meta($post_id, '_drp_dasie_external_id', true);
        $source_url = (string)get_post_meta($post_id, '_drp_dasie_url', true);
        $published = (string)get_post_meta($post_id, '_drp_dasie_published_at', true);
        $event_date = (string)get_post_meta($post_id, '_drp_dasie_event_date', true);
        $terms = get_the_terms($post_id, 'drp_dasie_category');
        $categories = [];
        if (is_array($terms)) foreach ($terms as $term) $categories[] = ['id' => (int)$term->term_id, 'slug' => $term->slug, 'name' => $term->name];
        foreach ($geometries_by_post[$post_id] ?? [] as $row) {
            $geometry = json_decode($row->geometry_json, true);
            if (!is_array($geometry) || !in_array($geometry['type'] ?? '', ['Point', 'LineString'], true) || !isset($geometry['coordinates']) || !is_array($geometry['coordinates'])) continue;
            // Walidacja podstawowa, by nie wysłać błędnych współrzędnych do Mapbox.
            $coords = $geometry['coordinates'];
            $points = $geometry['type'] === 'Point' ? [$coords] : $coords;
            if ($geometry['type'] === 'LineString' && count($points) < 2) continue;
            $valid = true;
            foreach ($points as $p) {
                if (!is_array($p) || count($p) < 2 || !is_numeric($p[0]) || !is_numeric($p[1]) || !is_finite((float)$p[0]) || !is_finite((float)$p[1]) || (float)$p[0] < -180 || (float)$p[0] > 180 || (float)$p[1] < -90 || (float)$p[1] > 90) { $valid = false; break; }
            }
            if (!$valid) continue;
            $geometry_id = (int)$row->geometry_id;
            $features[] = [
                'type' => 'Feature', 'id' => $post_id . '-' . $geometry_id,
                'geometry' => $geometry,
                'properties' => [
                    'dasie_id' => $post_id, 'geometry_id' => $geometry_id,
                    'name' => get_the_title($post), 'geometry_title' => (string)$row->geometry_title,
                    'tweet_id' => $platform === 'x' ? $external_id : null,
                    'tweet_url' => $platform === 'x' ? $source_url : null,
                    'tweet_published_date' => $platform === 'x' ? ($published ?: null) : null,
                    'platform' => $platform ?: null, 'external_id' => $external_id ?: null,
                    'source_url' => $source_url ?: null,
                    'published_date' => $published ?: null, 'event_date' => $event_date ?: null,
                    'description_html' => apply_filters('the_content', $post->post_content),
                    'categories' => $categories,
                ],
            ];
        }
    }
    $response = rest_ensure_response([
        'type' => 'FeatureCollection', 'features' => $features,
        'pagination' => [
            'page' => $page, 'per_page' => $per_page,
            'total_posts' => (int)$posts->found_posts,
            'total_pages' => (int)$posts->max_num_pages,
            'feature_count' => count($features),
        ],
    ]);
    $response->header('Cache-Control', 'public, max-age=300');
    return $response;
}
