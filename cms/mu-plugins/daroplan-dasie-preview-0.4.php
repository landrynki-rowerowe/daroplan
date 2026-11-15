<?php
/**
 * Plugin Name: DaRoPlan DASIE – podgląd materiału
 * Description: Podgląd źródła X, YouTube lub Instagram w edytorze DASIE, bez zmian w CMS Core i edytorach geometrii.
 * Version: 0.4.0
 */
if (!defined('ABSPATH')) { exit; }

add_action('add_meta_boxes_drp_dasie', function () {
    add_meta_box('drp_dasie_source_preview', 'Podgląd materiału źródłowego', 'drp_dasie_source_preview_render', 'drp_dasie', 'normal', 'default');
});

function drp_dasie_source_preview_render($post) {
    $url = (string) get_post_meta($post->ID, '_drp_dasie_url', true);
    echo '<div id="drp-dasie-source-preview" data-initial-url="' . esc_attr($url) . '">';
    echo '<p class="description">Podgląd pojawi się po zapisaniu wpisu. Jeśli osadzenie jest niedostępne, użyj linku do źródła. Zewnętrzne materiały mogą stosować pliki cookie.</p>';
    if (!$url) {
        echo '<p>Najpierw wpisz adres materiału i zapisz wpis.</p></div>';
        return;
    }
    if (!function_exists('drp_dasie_parse_url')) {
        echo '<p>Brakuje funkcji obsługi źródeł z CMS Core.</p></div>';
        return;
    }
    $parsed = drp_dasie_parse_url($url);
    if (is_wp_error($parsed)) {
        echo '<p>Adres nie jest rozpoznawany przez CMS.</p></div>';
        return;
    }
    $platform = $parsed['platform'];
    $safe_url = esc_url($url);
    echo '<p><strong>Platforma:</strong> ' . esc_html(strtoupper($platform)) . ' &nbsp; <a href="' . $safe_url . '" target="_blank" rel="noopener noreferrer">Otwórz oryginalny materiał ↗</a></p>';
    echo '<div style="max-width:680px;min-height:90px;">';
    if ($platform === 'youtube') {
        $video_id = $parsed['external_id'];
        // youtube-nocookie ogranicza część śledzenia przed odtworzeniem.
        echo '<div style="position:relative;padding-top:56.25%;height:0;overflow:hidden;border-radius:6px">';
        echo '<iframe loading="lazy" title="Podgląd YouTube" src="https://www.youtube-nocookie.com/embed/' . esc_attr(rawurlencode($video_id)) . '" style="position:absolute;inset:0;width:100%;height:100%;border:0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>';
        echo '</div>';
    } elseif ($platform === 'x') {
        echo '<blockquote class="twitter-tweet" data-dnt="true"><a href="' . $safe_url . '">Zobacz post w X</a></blockquote>';
        wp_enqueue_script('drp-dasie-x-widgets', 'https://platform.twitter.com/widgets.js', [], null, true);
    } elseif ($platform === 'instagram') {
        // Embed nie zawsze jest dostępny, szczególnie dla postów prywatnych lub usuniętych.
        echo '<blockquote class="instagram-media" data-instgrm-permalink="' . $safe_url . '" data-instgrm-version="14" style="max-width:540px;min-width:280px;width:100%;"><a href="' . $safe_url . '" target="_blank" rel="noopener noreferrer">Zobacz post na Instagramie</a></blockquote>';
        wp_enqueue_script('drp-dasie-ig-embed', 'https://www.instagram.com/embed.js', [], null, true);
    }
    echo '</div></div>';
}
