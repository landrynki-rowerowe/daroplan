<?php
/**
 * Plugin Name: DaRoPlan — Landrynki: zajawki i lista
 * Description: Rozróżnienie Landrynek w Opowieściach, zajawki i obrazki wyróżniające w API.
 * Version: 0.5.1
 */
if (!defined('ABSPATH')) { exit; }

// Core 0.2 rejestruje drp_story podczas init (domyślny priorytet 10).
add_action('init', function () {
    if (post_type_exists('drp_story')) {
        add_post_type_support('drp_story', 'excerpt');
        add_post_type_support('drp_story', 'thumbnail');
    }
}, 20);

function drp_lr_051_is_landrynka($post_id) {
    return get_post_meta((int) $post_id, '_drp_lr_enabled', true) === '1';
}

// Dodaj kolumnę, zachowując pozostałe kolumny WordPressa i innych modułów.
add_filter('manage_drp_story_posts_columns', function ($columns) {
    $out = [];
    foreach ($columns as $key => $label) {
        $out[$key] = $label;
        if ($key === 'title') $out['drp_lr_kind'] = 'Rodzaj';
    }
    if (!isset($out['drp_lr_kind'])) $out['drp_lr_kind'] = 'Rodzaj';
    return $out;
});
add_action('manage_drp_story_posts_custom_column', function ($column, $post_id) {
    if ($column !== 'drp_lr_kind') return;
    if (drp_lr_051_is_landrynka($post_id)) {
        echo '<strong>🍬 Landrynka</strong>';
    } else {
        echo 'Opowieść';
    }
}, 10, 2);

// Filtr tylko na liście Opowieści.
add_action('restrict_manage_posts', function ($post_type, $which = '') {
    if ($post_type !== 'drp_story' || ($which && $which !== 'top')) return;
    $selected = isset($_GET['drp_lr_kind_filter']) ? sanitize_key(wp_unslash($_GET['drp_lr_kind_filter'])) : '';
    echo '<label class="screen-reader-text" for="drp_lr_kind_filter">Filtruj rodzaj opowieści</label>';
    echo '<select name="drp_lr_kind_filter" id="drp_lr_kind_filter">';
    echo '<option value="">Wszystkie rodzaje</option>';
    echo '<option value="landrynka"' . selected($selected, 'landrynka', false) . '>Landrynki</option>';
    echo '<option value="story"' . selected($selected, 'story', false) . '>Zwykłe opowieści</option>';
    echo '</select>';
}, 10, 2);

add_action('pre_get_posts', function ($query) {
    if (!is_admin() || !$query->is_main_query() || $query->get('post_type') !== 'drp_story') return;
    $kind = isset($_GET['drp_lr_kind_filter']) ? sanitize_key(wp_unslash($_GET['drp_lr_kind_filter'])) : '';
    if (!in_array($kind, ['landrynka', 'story'], true)) return;
    $meta = (array) $query->get('meta_query');
    if ($kind === 'landrynka') {
        $meta[] = ['key' => '_drp_lr_enabled', 'value' => '1', 'compare' => '='];
    } else {
        // Starsze opowieści mogą w ogóle nie mieć tego pola.
        $meta[] = ['relation' => 'OR',
            ['key' => '_drp_lr_enabled', 'compare' => 'NOT EXISTS'],
            ['key' => '_drp_lr_enabled', 'value' => '1', 'compare' => '!=']
        ];
    }
    $query->set('meta_query', $meta);
});

function drp_lr_051_teaser_fields($post_id) {
    $post = get_post((int) $post_id);
    if (!$post || $post->post_type !== 'drp_story' || $post->post_status !== 'publish' || !drp_lr_051_is_landrynka($post->ID)) return null;
    $thumb_id = get_post_thumbnail_id($post->ID);
    $image = $thumb_id ? wp_get_attachment_image_url($thumb_id, 'large') : false;
    return [
        'excerpt' => get_the_excerpt($post),
        'featured_image_url' => $image ?: null,
    ];
}

// Rozszerza odpowiedzi istniejących endpointów 0.5 bez ich nadpisywania.
add_filter('rest_request_after_callbacks', function ($response, $handler, $request) {
    if (is_wp_error($response) || $request->get_method() !== 'GET') return $response;
    $route = $request->get_route();
    $is_list = $route === '/daroplan/v1/landrynki';
    $is_detail = (bool) preg_match('~^/daroplan/v1/landrynki/([0-9]+)$~D', $route);
    if (!$is_list && !$is_detail) return $response;
    $response = rest_ensure_response($response);
    if ($response->is_error()) return $response;
    $data = $response->get_data();
    if (!is_array($data)) return $response;
    if ($is_list) {
        foreach ($data as &$item) {
            if (!is_array($item) || !isset($item['id'])) continue;
            $extra = drp_lr_051_teaser_fields($item['id']);
            if ($extra !== null) $item = array_merge($item, $extra);
        }
        unset($item);
    } else {
        if (!isset($data['id'])) return $response;
        $extra = drp_lr_051_teaser_fields($data['id']);
        if ($extra !== null) $data = array_merge($data, $extra);
    }
    $response->set_data($data);
    return $response;
}, 10, 3);
