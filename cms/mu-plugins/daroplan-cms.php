<?php
/**
 * Plugin Name: DaRoPlan CMS Core
 * Description: Natywne typy treści, sceny i archiwum DASIE DaRoPlanu.
 * Version: 0.2.0
 */
if (!defined('ABSPATH')) { exit; }

add_action('init', function () {
    register_post_type('drp_story', [
        'labels' => ['name' => 'Opowieści', 'singular_name' => 'Opowieść', 'add_new_item' => 'Dodaj opowieść', 'edit_item' => 'Edytuj opowieść'],
        'public' => false, 'show_ui' => true, 'show_in_rest' => true,
        'publicly_queryable' => false, 'exclude_from_search' => true,
        'supports' => ['title', 'editor', 'thumbnail', 'revisions'],
        'menu_icon' => 'dashicons-book-alt',
        'capability_type' => 'post', 'map_meta_cap' => true,
    ]);
    register_post_type('drp_scene', [
        'labels' => ['name' => 'Sceny', 'singular_name' => 'Scena', 'add_new_item' => 'Dodaj scenę', 'edit_item' => 'Edytuj scenę'],
        'public' => false, 'show_ui' => true, 'show_in_rest' => true,
        'publicly_queryable' => false, 'exclude_from_search' => true,
        'supports' => ['title', 'editor', 'thumbnail', 'revisions', 'page-attributes'],
        'menu_icon' => 'dashicons-location-alt',
        'capability_type' => 'post', 'map_meta_cap' => true,
    ]);
    register_post_type('drp_dasie', [
        'labels' => [
            'name' => 'DASIE', 'singular_name' => 'DASIE',
            'add_new_item' => 'Dodaj DASIE', 'edit_item' => 'Edytuj DASIE',
            'all_items' => 'Wszystkie DASIE', 'menu_name' => 'DASIE',
        ],
        'public' => false, 'show_ui' => true, 'show_in_rest' => true,
        'publicly_queryable' => false, 'exclude_from_search' => true,
        'supports' => ['title', 'editor', 'thumbnail', 'revisions'],
        'menu_icon' => 'dashicons-location',
        'capability_type' => 'post', 'map_meta_cap' => true,
    ]);
    register_taxonomy('drp_dasie_category', ['drp_dasie'], [
        'labels' => ['name' => 'Kategorie DASIE', 'singular_name' => 'Kategoria DASIE'],
        'hierarchical' => true, 'show_ui' => true, 'show_admin_column' => true,
        'show_in_rest' => true, 'public' => false, 'rewrite' => false,
    ]);
    $categories = [
        'infrastruktura-rowerowa' => 'Infrastruktura rowerowa',
        'organizacja-ruchu' => 'Organizacja ruchu',
        'bezpieczenstwo' => 'Bezpieczeństwo',
        'transport-publiczny' => 'Transport publiczny',
        'przestrzen-publiczna' => 'Przestrzeń publiczna',
        'inwestycje-remonty' => 'Inwestycje i remonty',
        'partycypacja-spoleczna' => 'Partycypacja społeczna',
    ];
    // Tylko brakujące kategorie; nie nadpisujemy późniejszych zmian redaktora.
    foreach ($categories as $slug => $name) {
        if (!term_exists($slug, 'drp_dasie_category')) {
            wp_insert_term($name, 'drp_dasie_category', ['slug' => $slug]);
        }
    }
    register_post_meta('drp_scene', 'drp_story_id', [
        'type' => 'integer', 'single' => true, 'default' => 0, 'show_in_rest' => true,
        'sanitize_callback' => 'absint', 'auth_callback' => function () { return current_user_can('edit_posts'); },
    ]);
    register_post_meta('drp_scene', 'drp_map_config', [
        'type' => 'string', 'single' => true, 'default' => '{}', 'show_in_rest' => true,
        'sanitize_callback' => function ($value) {
            if (!is_string($value) || strlen($value) > 200000) { return '{}'; }
            $data = json_decode($value, true);
            if (!is_array($data) || json_last_error() !== JSON_ERROR_NONE) { return '{}'; }
            return wp_json_encode($data);
        },
        'auth_callback' => function () { return current_user_can('edit_posts'); },
    ]);
});

add_action('rest_api_init', function () {
    register_rest_route('daroplan/v1', '/stories', [
        'methods' => WP_REST_Server::READABLE,
        'permission_callback' => '__return_true',
        'callback' => function () {
            $posts = get_posts(['post_type' => 'drp_story', 'post_status' => 'publish', 'numberposts' => 100, 'orderby' => 'date', 'order' => 'DESC']);
            return rest_ensure_response(array_map(function ($p) {
                return ['id' => $p->ID, 'title' => get_the_title($p), 'excerpt' => get_the_excerpt($p), 'modified' => get_post_modified_time('c', true, $p)];
            }, $posts));
        },
    ]);
    register_rest_route('daroplan/v1', '/stories/(?P<id>\d+)', [
        'methods' => WP_REST_Server::READABLE,
        'permission_callback' => '__return_true',
        'callback' => function ($request) {
            $story = get_post(absint($request['id']));
            if (!$story || $story->post_type !== 'drp_story' || $story->post_status !== 'publish') {
                return new WP_Error('drp_not_found', 'Nie znaleziono opublikowanej opowieści.', ['status' => 404]);
            }
            $scenes = get_posts(['post_type' => 'drp_scene', 'post_status' => 'publish', 'numberposts' => 100,
                'meta_key' => 'drp_story_id', 'meta_value' => $story->ID, 'orderby' => 'menu_order', 'order' => 'ASC']);
            return rest_ensure_response([
                'id' => $story->ID, 'title' => get_the_title($story),
                'scenes' => array_map(function ($scene) {
                    $raw = get_post_meta($scene->ID, 'drp_map_config', true);
                    return ['id' => $scene->ID, 'title' => get_the_title($scene),
                        'content_html' => apply_filters('the_content', $scene->post_content),
                        'map' => json_decode($raw ?: '{}', true) ?: new stdClass()];
                }, $scenes),
            ]);
        },
    ]);
});


/** DASIE 0.2: metadane i edytor; bez ingerencji w publiczne API STORY. */
function drp_dasie_parse_url($url) {
    $url = trim((string) $url);
    if (!$url || !wp_http_validate_url($url)) { return new WP_Error('drp_url', 'Podaj poprawny publiczny adres HTTPS materiału.'); }
    $parts = wp_parse_url($url);
    if (strtolower($parts['scheme'] ?? '') !== 'https') { return new WP_Error('drp_https', 'Wymagany jest adres HTTPS.'); }
    $host = strtolower($parts['host'] ?? '');
    $path = $parts['path'] ?? '';
    $platform = ''; $external_id = '';
    if (in_array($host, ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'], true)
        && preg_match('~/(?:[^/]+/)?status/(\d{10,25})(?:/|$)~', $path, $m)) {
        $platform = 'x'; $external_id = $m[1];
    } elseif (in_array($host, ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be'], true)) {
        if (in_array($host, ['youtu.be', 'www.youtu.be'], true)) {
            $external_id = trim($path, '/');
        } elseif (preg_match('~^/(?:shorts|live|embed)/([^/]+)~', $path, $m)) {
            $external_id = $m[1];
        } elseif ($path === '/watch') {
            parse_str($parts['query'] ?? '', $query);
            $external_id = is_string($query['v'] ?? null) ? $query['v'] : '';
        }
        if (preg_match('/^[A-Za-z0-9_-]{11}$/D', $external_id)) { $platform = 'youtube'; }
    } elseif (in_array($host, ['instagram.com', 'www.instagram.com'], true)
        && preg_match('~^/(?:p|reel|tv)/([A-Za-z0-9_-]+)(?:/|$)~', $path, $m)) {
        $platform = 'instagram'; $external_id = $m[1];
    }
    if (!$platform) { return new WP_Error('drp_unsupported', 'Nie rozpoznano adresu posta X, filmu YouTube lub wpisu Instagram.'); }
    return ['platform' => $platform, 'external_id' => $external_id, 'url' => $url];
}

function drp_dasie_x_date($id) {
    // Snowflake: (id >> 22) + 1288834974657 ms; wymaga 64-bitowego PHP.
    if (PHP_INT_SIZE < 8 || !preg_match('/^\d{10,19}$/D', (string) $id)) { return ''; }
    $num = (int) $id;
    if ($num <= 0) { return ''; }
    $seconds = (int) floor((($num >> 22) + 1288834974657) / 1000);
    if ($seconds < 1288834974 || $seconds > time() + 86400) { return ''; }
    return gmdate('Y-m-d', $seconds);
}

add_action('add_meta_boxes_drp_dasie', function () {
    add_meta_box('drp_dasie_details', 'Źródło i daty DASIE', 'drp_dasie_metabox', 'drp_dasie', 'normal', 'high');
});

function drp_dasie_metabox($post) {
    wp_nonce_field('drp_dasie_save', 'drp_dasie_nonce');
    $url = get_post_meta($post->ID, '_drp_dasie_url', true);
    $platform = get_post_meta($post->ID, '_drp_dasie_platform', true);
    $external = get_post_meta($post->ID, '_drp_dasie_external_id', true);
    $published = get_post_meta($post->ID, '_drp_dasie_published_at', true);
    $event = get_post_meta($post->ID, '_drp_dasie_event_date', true);
    echo '<p><label for="drp_dasie_url"><strong>Adres materiału (HTTPS)</strong></label><br>';
    echo '<input type="url" id="drp_dasie_url" name="drp_dasie_url" style="width:100%" placeholder="https://x.com/.../status/..." value="' . esc_attr($url) . '"></p>';
    echo '<p>Platforma: <strong id="drp_dasie_platform_view">' . esc_html($platform ?: '—') . '</strong> · ID: <code id="drp_dasie_id_view">' . esc_html($external ?: '—') . '</code></p>';
    echo '<p><label for="drp_dasie_published_at">Data publikacji (YYYY-MM-DD)</label><br>';
    echo '<input type="date" id="drp_dasie_published_at" name="drp_dasie_published_at" value="' . esc_attr($published) . '"></p>';
    echo '<p><label for="drp_dasie_event_date">Data wydarzenia (opcjonalna, YYYY-MM-DD)</label><br>';
    echo '<input type="date" id="drp_dasie_event_date" name="drp_dasie_event_date" value="' . esc_attr($event) . '"></p>';
    echo '<p class="description">Dla X data publikacji zostanie wstępnie obliczona z identyfikatora. Można ją poprawić. Dla YouTube i Instagrama uzupełnij ją ręcznie. Kategorie wybierz w panelu bocznym.</p>';
}

function drp_dasie_valid_date($date) {
    if ($date === '') { return true; }
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/D', $date)) { return false; }
    $d = DateTimeImmutable::createFromFormat('!Y-m-d', $date, new DateTimeZone('UTC'));
    return $d && $d->format('Y-m-d') === $date;
}

function drp_dasie_duplicate($platform, $external_id, $exclude_id) {
    $matches = get_posts([
        'post_type' => 'drp_dasie', 'post_status' => ['publish', 'draft', 'pending', 'private', 'future'],
        'fields' => 'ids', 'posts_per_page' => 2, 'post__not_in' => [$exclude_id],
        'meta_query' => ['relation' => 'AND',
            ['key' => '_drp_dasie_platform', 'value' => $platform],
            ['key' => '_drp_dasie_external_id', 'value' => $external_id],
        ],
    ]);
    return !empty($matches) ? (int) $matches[0] : 0;
}

// Walidacja przed zapisem formularza klasycznego (również gdy używany jest Gutenberg).
add_filter('wp_insert_post_data', function ($data, $postarr) {
    if (($data['post_type'] ?? '') !== 'drp_dasie' || !is_admin() || !isset($_POST['drp_dasie_nonce'])) { return $data; }
    if (!wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['drp_dasie_nonce'])), 'drp_dasie_save')) { return $data; }
    $url = isset($_POST['drp_dasie_url']) ? esc_url_raw(wp_unslash($_POST['drp_dasie_url'])) : '';
    if (!$url) { return $data; } // Szkice bez URL są dozwolone.
    $parsed = drp_dasie_parse_url($url);
    if (is_wp_error($parsed)) { wp_die(esc_html($parsed->get_error_message()), 'DASIE — niepoprawny URL', ['back_link' => true]); }
    $post_id = absint($postarr['ID'] ?? 0);
    $duplicate = drp_dasie_duplicate($parsed['platform'], $parsed['external_id'], $post_id);
    if ($duplicate) {
        wp_die('Ten materiał istnieje już w DASIE (wpis #' . esc_html((string) $duplicate) . ').', 'DASIE — duplikat', ['back_link' => true]);
    }
    foreach (['drp_dasie_published_at', 'drp_dasie_event_date'] as $field) {
        $value = isset($_POST[$field]) ? sanitize_text_field(wp_unslash($_POST[$field])) : '';
        if (!drp_dasie_valid_date($value)) { wp_die('Nieprawidłowa data w polu ' . esc_html($field), 'DASIE — data', ['back_link' => true]); }
    }
    return $data;
}, 10, 2);

add_action('save_post_drp_dasie', function ($post_id, $post, $update) {
    if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id)) { return; }
    if (!isset($_POST['drp_dasie_nonce']) || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['drp_dasie_nonce'])), 'drp_dasie_save')) { return; }
    if (!current_user_can('edit_post', $post_id)) { return; }
    $url = isset($_POST['drp_dasie_url']) ? esc_url_raw(wp_unslash($_POST['drp_dasie_url'])) : '';
    if (!$url) {
        foreach (['_drp_dasie_url', '_drp_dasie_platform', '_drp_dasie_external_id'] as $key) { delete_post_meta($post_id, $key); }
    } else {
        $parsed = drp_dasie_parse_url($url);
        if (is_wp_error($parsed)) { return; }
        update_post_meta($post_id, '_drp_dasie_url', $parsed['url']);
        update_post_meta($post_id, '_drp_dasie_platform', $parsed['platform']);
        update_post_meta($post_id, '_drp_dasie_external_id', $parsed['external_id']);
    }
    foreach (['drp_dasie_published_at' => '_drp_dasie_published_at', 'drp_dasie_event_date' => '_drp_dasie_event_date'] as $field => $key) {
        $value = isset($_POST[$field]) ? sanitize_text_field(wp_unslash($_POST[$field])) : '';
        if (drp_dasie_valid_date($value)) { update_post_meta($post_id, $key, $value); }
    }
}, 10, 3);

add_action('admin_footer-post.php', 'drp_dasie_admin_js');
add_action('admin_footer-post-new.php', 'drp_dasie_admin_js');
function drp_dasie_admin_js() {
    $screen = get_current_screen();
    if (!$screen || $screen->post_type !== 'drp_dasie') { return; }
    ?>
    <script>
    (function () {
      const input = document.getElementById('drp_dasie_url');
      if (!input) return;
      const platformEl = document.getElementById('drp_dasie_platform_view');
      const idEl = document.getElementById('drp_dasie_id_view');
      const dateEl = document.getElementById('drp_dasie_published_at');
      let lastAutoDate = '';
      function update() {
        let platform = '', id = '';
        try {
          const u = new URL(input.value.trim());
          const host = u.hostname.toLowerCase(), path = u.pathname;
          let m;
          if (['x.com','www.x.com','twitter.com','www.twitter.com','mobile.twitter.com'].includes(host) && (m = path.match(/\/(?:[^/]+\/)?status\/(\d{10,25})(?:\/|$)/))) {
            platform = 'x'; id = m[1];
          } else if (['youtu.be','www.youtu.be'].includes(host)) {
            id = path.slice(1).split('/')[0]; if (/^[A-Za-z0-9_-]{11}$/.test(id)) platform = 'youtube';
          } else if (['youtube.com','www.youtube.com','m.youtube.com'].includes(host)) {
            m = path.match(/^\/(?:shorts|live|embed)\/([^/]+)/);
            id = m ? m[1] : path === '/watch' ? (u.searchParams.get('v') || '') : '';
            if (/^[A-Za-z0-9_-]{11}$/.test(id)) platform = 'youtube';
          } else if (['instagram.com','www.instagram.com'].includes(host) && (m = path.match(/^\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)(?:\/|$)/))) {
            platform = 'instagram'; id = m[1];
          }
        } catch (e) {}
        platformEl.textContent = platform || '—'; idEl.textContent = platform ? id : '—';
        if (platform === 'x' && /^\d{10,19}$/.test(id)) {
          try {
            const ms = (BigInt(id) >> 22n) + 1288834974657n;
            const iso = new Date(Number(ms)).toISOString().slice(0, 10);
            if (!dateEl.value || dateEl.value === lastAutoDate) { dateEl.value = iso; lastAutoDate = iso; }
          } catch (e) {}
        }
      }
      input.addEventListener('input', update);
      update();
    })();
    </script>
    <?php
}
