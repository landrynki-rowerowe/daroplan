<?php
/**
 * Plugin Name: DaRoPlan — Opowieści i Sceny
 * Description: Etap 1 — organizacja Scen, parametry kamery, zasoby DASIE i odrębne API /narratives.
 * Version: 0.1.2
 */
if (!defined('ABSPATH')) exit;

function drps01_is_narrative($post_id) {
    $post = get_post(absint($post_id));
    return $post && $post->post_type === 'drp_story' && get_post_meta($post->ID, '_drp_lr_enabled', true) !== '1';
}
function drps01_layouts() {
    return [
        'split' => 'Tekst + mapa',
        'map-full' => 'Mapa pełnoekranowa',
        'content-full' => 'Treść pełnoekranowa',
        'overlay' => 'Mapa z nakładką multimedialną'
    ];
}
function drps01_scene_config($post_id) {
    $config = json_decode((string) get_post_meta($post_id, 'drp_map_config', true), true);
    return is_array($config) ? $config : [];
}
function drps01_story_scenes($story_id, $published_only = false) {
    return get_posts([
        'post_type'=>'drp_scene', 'post_status'=>$published_only ? 'publish' : ['publish','draft','pending','future','private'],
        'posts_per_page'=>200, 'meta_key'=>'drp_story_id', 'meta_value'=>absint($story_id),
        'orderby'=>['menu_order'=>'ASC','date'=>'ASC']
    ]);
}

add_action('add_meta_boxes_drp_story', function($post) {
    if (get_post_meta($post->ID, '_drp_lr_enabled', true) === '1') return;
    add_meta_box('drps01_scenes', 'Sceny tej Opowieści', 'drps01_story_box', 'drp_story', 'normal', 'high');
});
function drps01_story_box($post) {
    echo '<p>Opowieść składa się z osobnych Scen. Każda ma własną treść, układ, ustawienia kamery i powiązania z DASIE.</p>';
    if ($post->post_status === 'auto-draft') {
        echo '<p><strong>Najpierw zapisz szkic Opowieści.</strong></p>'; return;
    }
    $scenes = drps01_story_scenes($post->ID);
    if (!$scenes) echo '<p>Ta Opowieść nie ma jeszcze Scen.</p>';
    else {
        echo '<ol>';
        foreach ($scenes as $scene) {
            $layout = get_post_meta($scene->ID, '_drps01_layout', true) ?: 'split';
            echo '<li><a href="'.esc_url(get_edit_post_link($scene->ID)).'">'.esc_html(get_the_title($scene)).'</a> — '.esc_html(drps01_layouts()[$layout] ?? $layout).' — '.esc_html($scene->post_status).' — kolejność '.(int)$scene->menu_order.'</li>';
        }
        echo '</ol>';
    }
    if (current_user_can('edit_post', $post->ID)) {
        $url = wp_nonce_url(add_query_arg(['action'=>'drps01_new_scene','story_id'=>$post->ID], admin_url('admin-post.php')), 'drps01_new_scene_'.$post->ID);
        echo '<a class="button button-primary" href="'.esc_url($url).'">Dodaj Scenę</a>';
    }
    echo '<p class="description">Kolejność zmienisz w polu Kolejność Sceny w sekcji Opowieść, układ i kamera.</p>';
}
add_action('admin_post_drps01_new_scene', function() {
    $story_id = absint($_GET['story_id'] ?? 0);
    if (!$story_id || !drps01_is_narrative($story_id) || !current_user_can('edit_post', $story_id)) wp_die('Brak dostępu do Opowieści.');
    check_admin_referer('drps01_new_scene_'.$story_id);
    $max_order = -10;
    foreach (drps01_story_scenes($story_id) as $scene) $max_order = max($max_order, (int)$scene->menu_order);
    $new_id = wp_insert_post(['post_type'=>'drp_scene','post_status'=>'draft','post_title'=>'Nowa Scena','menu_order'=>$max_order+10], true);
    if (is_wp_error($new_id)) wp_die(esc_html($new_id->get_error_message()));
    update_post_meta($new_id, 'drp_story_id', $story_id);
    update_post_meta($new_id, '_drps01_layout', 'split');
    wp_safe_redirect(get_edit_post_link($new_id, 'raw')); exit;
});

add_action('add_meta_boxes_drp_scene', function() {
    add_meta_box('drps01_scene', 'Opowieść, układ i kamera', 'drps01_scene_box', 'drp_scene', 'normal', 'high');
    add_meta_box('drps01_dasie', 'Powiązane DASIE', 'drps01_dasie_box', 'drp_scene', 'normal', 'default');
});
function drps01_scene_box($post) {
    wp_nonce_field('drps01_save', 'drps01_nonce');
    $story_id = absint(get_post_meta($post->ID, 'drp_story_id', true));
    $layout = get_post_meta($post->ID, '_drps01_layout', true) ?: 'split';
    $config = drps01_scene_config($post->ID);
    $cam = is_array($config['camera'] ?? null) ? $config['camera'] : [];
    $center = is_array($cam['center'] ?? null) ? $cam['center'] : [19.94,50.06];
    $stories = get_posts(['post_type'=>'drp_story','post_status'=>['publish','draft','pending','private'],'posts_per_page'=>-1,'orderby'=>'title','order'=>'ASC']);
    echo '<p><label for="drps01_parent"><strong>Opowieść nadrzędna</strong></label><br><select name="drps01_parent" id="drps01_parent"><option value="0">— wybierz —</option>';
    foreach ($stories as $story) {
        if (!drps01_is_narrative($story->ID)) continue;
        echo '<option value="'.(int)$story->ID.'" '.selected($story_id,$story->ID,false).'>'.esc_html(get_the_title($story)).'</option>';
    }
    echo '</select></p><p><label for="drps01_layout"><strong>Układ Sceny</strong></label><br><select name="drps01_layout" id="drps01_layout">';
    foreach (drps01_layouts() as $key => $name) echo '<option value="'.esc_attr($key).'" '.selected($layout,$key,false).'>'.esc_html($name).'</option>';
    echo '</select></p><p><strong>Kamera mapy</strong> (wersja 0.1: wartości liczbowe, wizualny edytor później)</p>';
    echo '<p><label for="drps01_order"><strong>Kolejność Sceny</strong></label><br><input type="number" id="drps01_order" name="drps01_order" min="0" max="2147483647" step="1" value="'.esc_attr((string)$post->menu_order).'"></p><p class="description">Sceny są wyświetlane od najmniejszej do największej wartości.</p>';
    $fields = [
        'lon'=>['Długość geograficzna', $center[0] ?? 19.94, '0.000001'],
        'lat'=>['Szerokość geograficzna', $center[1] ?? 50.06, '0.000001'],
        'zoom'=>['Zoom', $cam['zoom'] ?? 13, '0.1'],
        'bearing'=>['Obrót (bearing)', $cam['bearing'] ?? 0, '1'],
        'pitch'=>['Pochylenie (pitch)', $cam['pitch'] ?? 0, '1']
    ];
    echo '<div style="display:flex;gap:12px;flex-wrap:wrap">';
    foreach ($fields as $key => $field) {
        echo '<label style="display:block;min-width:160px">'.esc_html($field[0]).'<br><input type="number" name="drps01_'.esc_attr($key).'" step="'.esc_attr($field[2]).'" value="'.esc_attr((string)$field[1]).'" style="width:155px"></label>';
    }
    echo '</div><p class="description">Warstwy i filtry dodamy w kolejnych etapach. Inne pola konfiguracji są zachowywane.</p>';
}
function drps01_dasie_box($post) {
    $config = drps01_scene_config($post->ID);
    $selected_ids = array_map('absint', (array)($config['resources']['dasie_ids'] ?? []));
    $items = get_posts(['post_type'=>'drp_dasie','post_status'=>['publish','draft'],'posts_per_page'=>-1,'orderby'=>'title','order'=>'ASC']);
    echo '<p>Wybierz wpisy DASIE. Powiązania nie modyfikują wpisów ani geometrii źródłowych.</p>';
    echo '<div id="drps01-dasie-summary" style="background:#f6f7f7;border:1px solid #dcdcde;padding:12px;margin:12px 0;max-width:624px">';
    echo '<strong>Powiązane materiały — <span id="drps01-dasie-count">0</span></strong>';
    echo '<ul id="drps01-dasie-list" style="list-style:disc;padding-left:20px;margin:8px 0 0" aria-live="polite"></ul></div>';
    echo '<select id="drps01-dasie-select" name="drps01_dasie_ids[]" multiple size="'.min(12,max(4,count($items))).'" style="width:100%;max-width:650px">';
    foreach ($items as $item) {
        echo '<option value="'.(int)$item->ID.'" '.selected(in_array($item->ID,$selected_ids,true),true,false).'>'.esc_html(get_the_title($item)).' (#'.(int)$item->ID.', '.esc_html($item->post_status).')</option>';
    }
    echo '</select><p class="description">Cmd/Ctrl + kliknięcie pozwala zaznaczać wiele. Szkice DASIE nie są udostępniane przez publiczne API Opowieści.</p>';
    echo '<input type="hidden" name="drps01_dasie_present" value="1">';
    echo '<script>(function(){
        var select = document.getElementById("drps01-dasie-select");
        var list = document.getElementById("drps01-dasie-list");
        var count = document.getElementById("drps01-dasie-count");
        if (!select || !list || !count) return;
        function refresh(){
            var chosen = Array.prototype.filter.call(select.options, function(option){ return option.selected; });
            count.textContent = chosen.length;
            list.textContent = "";
            if (!chosen.length) {
                var empty = document.createElement("li");
                empty.textContent = "Brak wybranych materiałów DASIE.";
                list.appendChild(empty);
                return;
            }
            chosen.forEach(function(option){
                var item = document.createElement("li");
                item.textContent = option.textContent;
                list.appendChild(item);
            });
        }
        select.addEventListener("change", refresh);
        refresh();
    })();</script>';

}

add_action('save_post_drp_scene', function($post_id) {
    if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id) || !isset($_POST['drps01_nonce'])) return;
    if (!wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['drps01_nonce'])), 'drps01_save') || !current_user_can('edit_post', $post_id)) return;
    $parent = absint($_POST['drps01_parent'] ?? 0);
    if ($parent && (!drps01_is_narrative($parent) || !current_user_can('edit_post', $parent))) return;
    $numbers = [];
    foreach (['lon','lat','zoom','bearing','pitch'] as $key) {
        $v = isset($_POST['drps01_'.$key]) ? trim((string)wp_unslash($_POST['drps01_'.$key])) : '';
        if ($v === '' || !is_numeric($v)) return;
        $numbers[$key]=(float)$v;
    }
    if ($numbers['lon'] < -180 || $numbers['lon'] > 180 || $numbers['lat'] < -85 || $numbers['lat'] > 85 ||
        $numbers['zoom'] < 0 || $numbers['zoom'] > 22 || $numbers['bearing'] < -360 || $numbers['bearing'] > 360 ||
        $numbers['pitch'] < 0 || $numbers['pitch'] > 85) return;
    $layout = sanitize_key(wp_unslash($_POST['drps01_layout'] ?? 'split'));
    if (!array_key_exists($layout, drps01_layouts())) $layout = 'split';
    $config = drps01_scene_config($post_id);
    $config['schema_version']=1;
    $camera = is_array($config['camera'] ?? null) ? $config['camera'] : [];
    $camera['center']=[$numbers['lon'], $numbers['lat']];
    foreach (['zoom','bearing','pitch'] as $key) $camera[$key] = $numbers[$key];
    $config['camera']=$camera;
    if (!is_array($config['resources'] ?? null)) $config['resources']=[];
    if (isset($_POST['drps01_dasie_present'])) {
        $incoming = is_array($_POST['drps01_dasie_ids'] ?? null) ? wp_unslash($_POST['drps01_dasie_ids']) : [];
        $ids = array_values(array_unique(array_filter(array_map('absint', $incoming))));
        $config['resources']['dasie_ids'] = array_values(array_filter($ids, function($id) {
            $p = get_post($id);
            return $p && $p->post_type === 'drp_dasie' && in_array($p->post_status, ['publish','draft'], true);
        }));
    }
    if (isset($_POST['drps01_order']) && is_scalar($_POST['drps01_order'])) {
        $order = filter_var(wp_unslash($_POST['drps01_order']), FILTER_VALIDATE_INT, ['options'=>['min_range'=>0,'max_range'=>2147483647]]);
        if ($order !== false && (int)get_post_field('menu_order', $post_id) !== $order) {
            wp_update_post(['ID'=>$post_id, 'menu_order'=>$order]);
        }
    }
    update_post_meta($post_id, 'drp_story_id', $parent);
    update_post_meta($post_id, '_drps01_layout', $layout);
    update_post_meta($post_id, 'drp_map_config', wp_json_encode($config, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));
}, 10, 1);

add_action('rest_api_init', function() {
    register_rest_route('daroplan/v1','/narratives',[
        'methods'=>WP_REST_Server::READABLE,'permission_callback'=>'__return_true',
        'callback'=>function() {
            $posts = get_posts(['post_type'=>'drp_story','post_status'=>'publish','posts_per_page'=>100,'orderby'=>'date','order'=>'DESC']);
            $result=[];
            foreach ($posts as $post) {
                if (!drps01_is_narrative($post->ID)) continue;
                $result[]=['id'=>$post->ID,'title'=>get_the_title($post),'excerpt'=>get_the_excerpt($post)];
            }
            return rest_ensure_response($result);
        }
    ]);
    register_rest_route('daroplan/v1','/narratives/(?P<id>\\d+)',[
        'methods'=>WP_REST_Server::READABLE,'permission_callback'=>'__return_true',
        'args'=>['id'=>['validate_callback'=>function($value) { return absint($value)>0; }]],
        'callback'=>function($request) {
            $story_id=absint($request['id']);
            $story=get_post($story_id);
            if (!$story || $story->post_status !== 'publish' || !drps01_is_narrative($story_id)) {
                return new WP_Error('drps01_not_found','Nie znaleziono opublikowanej Opowieści.',['status'=>404]);
            }
            $out=[];
            foreach (drps01_story_scenes($story_id,true) as $scene) {
                $config=drps01_scene_config($scene->ID);
                if (!is_array($config['resources'] ?? null)) $config['resources']=[];
                $published=[];
                foreach ((array)($config['resources']['dasie_ids'] ?? []) as $id) {
                    $item=get_post(absint($id));
                    if ($item && $item->post_type === 'drp_dasie' && $item->post_status === 'publish') $published[]=absint($id);
                }
                $config['resources']['dasie_ids']=$published;
                $layout=get_post_meta($scene->ID,'_drps01_layout',true) ?: 'split';
                $out[]=[
                    'id'=>$scene->ID,'title'=>get_the_title($scene),'order'=>(int)$scene->menu_order,
                    'layout'=>array_key_exists($layout,drps01_layouts()) ? $layout : 'split',
                    'content_html'=>apply_filters('the_content',$scene->post_content),'map'=>$config
                ];
            }
            return rest_ensure_response(['id'=>$story_id,'title'=>get_the_title($story),'scenes'=>$out]);
        }
    ]);
});
