<?php
/**
 * Plugin Name: DaRoPlan CMS Geometries
 * Description: DASIE 0.3.5 — wybór geometrii na mapie i Mapbox Draw; relacje wiele-do-wielu.
 * Version: 0.3.5
 */
if (!defined('ABSPATH')) exit;

function drp03_tables() {
    global $wpdb;
    return [$wpdb->prefix . 'drp_geometries', $wpdb->prefix . 'drp_dasie_geometry'];
}
function drp03_install() {
    if (get_option('drp03_schema_version') === '0.3.0') return;
    global $wpdb;
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    [$geo, $rel] = drp03_tables();
    $charset = $wpdb->get_charset_collate();
    dbDelta("CREATE TABLE $geo (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        title varchar(255) NOT NULL DEFAULT '',
        geometry_type varchar(20) NOT NULL,
        geometry_json longtext NOT NULL,
        created_at datetime NOT NULL,
        updated_at datetime NOT NULL,
        PRIMARY KEY  (id),
        KEY geometry_type (geometry_type)
    ) $charset;");
    dbDelta("CREATE TABLE $rel (
        dasie_id bigint(20) unsigned NOT NULL,
        geometry_id bigint(20) unsigned NOT NULL,
        PRIMARY KEY  (dasie_id,geometry_id),
        KEY geometry_id (geometry_id)
    ) $charset;");
    if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $geo)) === $geo && $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $rel)) === $rel) {
        update_option('drp03_schema_version', '0.3.0', false);
    }
}
add_action('admin_init', 'drp03_install');

function drp03_validate_geojson($raw) {
    if (!is_string($raw) || strlen($raw) > 250000) return new WP_Error('size', 'Geometria jest zbyt duża (maks. 250 KB).');
    $data = json_decode($raw, true);
    if (!is_array($data)) return new WP_Error('json', 'Nieprawidłowy JSON.');
    if (($data['type'] ?? '') === 'Feature') $data = $data['geometry'] ?? [];
    $type = $data['type'] ?? '';
    if (!in_array($type, ['Point', 'LineString'], true)) return new WP_Error('type', 'Dozwolone są Point i LineString.');
    $coords = $data['coordinates'] ?? null;
    $valid_pair = static function ($p) {
        return is_array($p) && count($p) === 2 && array_is_list($p)
            && is_numeric($p[0]) && is_numeric($p[1])
            && is_finite((float)$p[0]) && is_finite((float)$p[1])
            && (float)$p[0] >= -180 && (float)$p[0] <= 180
            && (float)$p[1] >= -90 && (float)$p[1] <= 90;
    };
    if ($type === 'Point') {
        if (!$valid_pair($coords)) return new WP_Error('coordinates', 'Nieprawidłowe współrzędne punktu.');
        $coords = [(float)$coords[0], (float)$coords[1]];
    } else {
        if (!is_array($coords) || count($coords) < 2 || count($coords) > 5000) return new WP_Error('coordinates', 'Linia wymaga od 2 do 5000 wierzchołków.');
        foreach ($coords as $p) if (!$valid_pair($p)) return new WP_Error('coordinates', 'Nieprawidłowy wierzchołek linii.');
        $coords = array_map(static fn($p) => [(float)$p[0], (float)$p[1]], $coords);
    }
    return ['type' => $type, 'coordinates' => $coords];
}

add_action('admin_menu', function () {
    add_submenu_page('edit.php?post_type=drp_dasie', 'Geometrie DASIE', 'Geometrie', 'edit_posts', 'drp03-geometries', 'drp03_admin_page');
    add_submenu_page('edit.php?post_type=drp_dasie', 'Ustawienia mapy DASIE', 'Ustawienia mapy', 'manage_options', 'drp03-map-settings', 'drp03_settings_page');
});
function drp03_settings_page() {
    if (!current_user_can('manage_options')) wp_die('Brak uprawnień.');
    if (isset($_POST['drp03_settings_nonce'])) {
        check_admin_referer('drp03_settings', 'drp03_settings_nonce');
        $token = sanitize_text_field(wp_unslash($_POST['drp03_map_token'] ?? ''));
        if ($token !== '' && !preg_match('/^pk\.[A-Za-z0-9._-]+$/', $token)) echo '<div class="notice notice-error"><p>Podaj publiczny token Mapbox zaczynający się od pk.</p></div>';
        else { update_option('drp03_map_token', $token, false); echo '<div class="notice notice-success"><p>Zapisano ustawienia.</p></div>'; }
    }
    echo '<div class="wrap"><h1>Mapa edytora DASIE</h1><form method="post">';
    wp_nonce_field('drp03_settings', 'drp03_settings_nonce');
    echo '<p><label>Publiczny token Mapbox (pk.) <input type="text" name="drp03_map_token" size="85" value="' . esc_attr(get_option('drp03_map_token', '')) . '"></label></p>';
    echo '<p>Używaj wyłącznie publicznego tokenu z ograniczeniami domen. Nie wklejaj tokenu zapisu (sk.). Token jest przekazywany do przeglądarki administratora.</p>';
    submit_button('Zapisz'); echo '</form></div>';
}
// Biblioteki ładujemy PRZED renderowaniem strony administratora.
add_action('admin_enqueue_scripts', function ($hook) {
    if ($hook !== 'dasie_page_drp03-geometries' && (!isset($_GET['page']) || sanitize_key(wp_unslash($_GET['page'])) !== 'drp03-geometries')) return;
    if (!current_user_can('edit_posts') || !get_option('drp03_map_token', '')) return;
    wp_enqueue_style('drp033-mapbox-css', 'https://api.mapbox.com/mapbox-gl-js/v3.9.4/mapbox-gl.css', [], '3.9.4');
    wp_enqueue_style('drp033-draw-css', 'https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-draw/v1.5.0/mapbox-gl-draw.css', ['drp033-mapbox-css'], '1.5.0');
    wp_enqueue_script('drp033-mapbox-js', 'https://api.mapbox.com/mapbox-gl-js/v3.9.4/mapbox-gl.js', [], '3.9.4', true);
    wp_enqueue_script('drp033-draw-js', 'https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-draw/v1.5.0/mapbox-gl-draw.js', ['drp033-mapbox-js'], '1.5.0', true);
    wp_register_script('drp033-editor', false, ['drp033-draw-js'], '0.3.5', true);
    wp_enqueue_script('drp033-editor');
    wp_add_inline_script('drp033-editor', drp033_js());
    wp_add_inline_style('drp033-draw-css', '
      #drp033_map{position:relative;width:100%;max-width:1100px;height:510px;min-height:510px;overflow:hidden;border:1px solid #b8c0c8;box-sizing:border-box}
      #drp033_map .mapboxgl-map{width:100%;height:100%}
      #drp033_status{margin:8px 0;min-height:20px}
      #drp033_geojson{width:100%;max-width:1100px;font-family:monospace}
    ');
});

function drp03_admin_page() {
    if (!current_user_can('edit_posts')) wp_die('Brak uprawnień.');
    global $wpdb;
    [$geo, $rel] = drp03_tables();
    $id = absint($_GET['geometry_id'] ?? 0);
    $record = $id ? $wpdb->get_row($wpdb->prepare("SELECT * FROM $geo WHERE id=%d", $id)) : null;
    if ($id && !$record) wp_die('Nie znaleziono geometrii.');
    $records = $wpdb->get_results("SELECT id,title,geometry_type,updated_at FROM $geo ORDER BY id DESC LIMIT 200");
    // Podgląd wszystkich geometrii na mapie; osobny od aktywnego obiektu Draw.
    $map_rows = $wpdb->get_results("SELECT id,title,geometry_type,geometry_json FROM $geo ORDER BY id DESC");
    $map_features = [];
    foreach ($map_rows as $item) {
        $g = json_decode($item->geometry_json, true);
        if (!is_array($g) || !in_array($g['type'] ?? '', ['Point', 'LineString'], true)) continue;
        $map_features[] = [
            'type' => 'Feature', 'id' => (int)$item->id,
            'properties' => ['geometry_id' => (int)$item->id, 'title' => $item->title],
            'geometry' => $g
        ];
    }
    $token = get_option('drp03_map_token', '');
    $geometry = $record ? $record->geometry_json : '';
    $links = $record ? (int)$wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM $rel WHERE geometry_id=%d", $id)) : 0;
    echo '<div class="wrap"><h1>Geometrie DASIE 0.3.5</h1><p>Edytor Mapbox Draw. Zmiany istniejącej geometrii zachowują jej ID i dotyczą wszystkich powiązanych wpisów DASIE.</p>';
    if (isset($_GET['drp03_msg'])) echo '<div class="notice notice-info"><p>' . esc_html(sanitize_text_field(wp_unslash($_GET['drp03_msg']))) . '</p></div>';
    echo '<h2>' . ($record ? 'Edytuj geometrię #' . (int)$record->id : 'Nowa geometria') . '</h2>';
    if ($record && $links) echo '<p><strong>Uwaga:</strong> ta geometria jest powiązana z ' . $links . ' wpisami DASIE. Zmiana współrzędnych wpłynie na wszystkie te wpisy.</p>';
    echo '<form id="drp033_form" method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
    wp_nonce_field('drp03_save_geometry', 'drp03_nonce');
    echo '<input type="hidden" name="action" value="drp03_save_geometry"><input type="hidden" name="geometry_id" value="' . ($record ? (int)$record->id : 0) . '">';
    echo '<p><label for="drp033_title">Nazwa:</label> <input id="drp033_title" name="geometry_title" size="65" maxlength="255" value="' . esc_attr($record->title ?? '') . '"></p>';
    if ($token) {
        echo '<p class="description"><strong>Niebieskie:</strong> zapisane geometrie (kliknij, aby otworzyć do edycji). <strong>Różowe:</strong> aktualnie edytowany obiekt Mapbox Draw. Zapisane obiekty są wyświetlane tylko jako podgląd i nie tworzą kopii.</p>';
        echo '<div id="drp033_map"></div>';
        echo '<p class="description">Narzędzia Draw: punkt, linia, zaznaczanie i kosz. Kliknij geometrię, aby ją przesunąć lub edytować wierzchołki. Na mapie zapisujemy jeden obiekt.</p>';
        echo '<p><button type="button" class="button" id="drp033_fit">Pokaż całą geometrię</button> <button type="button" class="button" id="drp033_reset">Przywróć zapisaną geometrię</button></p>';
        echo '<div id="drp033_status" role="status" aria-live="polite"></div>';
    } else echo '<p class="notice notice-warning" style="padding:10px">Brak tokenu Mapbox. Ustaw go w DASIE → Ustawienia mapy. GeoJSON nadal można edytować ręcznie.</p>';
    echo '<details id="drp033_advanced"><summary>Zaawansowane: GeoJSON (Point lub LineString)</summary>';
    echo '<p><textarea id="drp033_geojson" name="geometry_json" rows="6">' . esc_textarea($geometry) . '</textarea></p>';
    if ($token) echo '<p><button type="button" class="button" id="drp033_load_json">Wczytaj GeoJSON na mapę</button></p>';
    echo '</details>';
    submit_button($record ? 'Zapisz zmiany geometrii' : 'Dodaj geometrię');
    echo '</form>';
    if ($record) {
        echo '<hr><h2>Usuń geometrię</h2>';
        echo '<p>Usunięcie geometrii jest nieodwracalne. Wpisy DASIE pozostaną, ale utracą powiązanie z tym obiektem.</p>';
        echo '<p>Powiązane wpisy DASIE: <strong>' . $links . '</strong>.</p>';
        echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
        wp_nonce_field('drp035_delete_geometry_' . (int)$record->id, 'drp035_delete_nonce');
        echo '<input type="hidden" name="action" value="drp035_delete_geometry">';
        echo '<input type="hidden" name="geometry_id" value="' . (int)$record->id . '">';
        echo '<p><label for="drp035_confirm">Aby usunąć, wpisz identyfikator geometrii: <strong>' . (int)$record->id . '</strong></label> ';
        echo '<input type="text" id="drp035_confirm" name="confirm_id" autocomplete="off" required pattern="[0-9]+" size="9"></p>';
        echo '<p><button type="submit" class="button button-link-delete" onclick="return confirm(&quot;Na pewno trwale usunąć geometrię i wszystkie jej powiązania?&quot;)">Usuń geometrię na stałe</button></p>';
        echo '</form>';
    }
    if ($token) {
        $config = [
            'token' => $token,
            'geometry' => $record ? json_decode($record->geometry_json, true) : null,
            'currentId' => $record ? (int)$record->id : 0,
            'features' => $map_features,
            'editUrl' => admin_url('edit.php?post_type=drp_dasie&page=drp03-geometries&geometry_id='),
        ];
        echo '<script type="application/json" id="drp033_config">' . wp_json_encode($config, JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT) . '</script>';
    }
    echo '<h2>Ostatnie geometrie</h2><table class="widefat striped"><thead><tr><th>ID</th><th>Nazwa</th><th>Typ</th><th>Zmodyfikowano</th><th></th></tr></thead><tbody>';
    foreach ($records as $r) echo '<tr><td>' . (int)$r->id . '</td><td>' . esc_html($r->title) . '</td><td>' . esc_html($r->geometry_type) . '</td><td>' . esc_html($r->updated_at) . '</td><td><a href="' . esc_url(add_query_arg(['page'=>'drp03-geometries','geometry_id'=>(int)$r->id], admin_url('edit.php?post_type=drp_dasie'))) . '">Edytuj</a></td></tr>';
    echo '</tbody></table></div>';
}

function drp033_js() {
    return <<<'JS'
(function(){
  function init(){
    const el=document.getElementById('drp033_map');if(!el)return;
    const ta=document.getElementById('drp033_geojson');
    const status=document.getElementById('drp033_status');
    const say=(message)=>{status.textContent=message;};
    if(typeof mapboxgl==='undefined'||typeof MapboxDraw==='undefined'){
      say('Nie udało się załadować Mapbox GL JS lub Draw.');return;
    }
    let cfg;
    try{cfg=JSON.parse(document.getElementById('drp033_config').textContent);}catch(e){say('Błąd konfiguracji mapy.');return;}
    mapboxgl.accessToken=cfg.token;
    const map=new mapboxgl.Map({container:el,style:'mapbox://styles/mapbox/light-v11',center:[19.94,50.06],zoom:12});
    const draw=new MapboxDraw({displayControlsDefault:false,controls:{point:true,line_string:true,trash:true},defaultMode:'simple_select'});
    map.addControl(new mapboxgl.NavigationControl(),'top-left');
    map.addControl(draw,'top-right');
    let loaded=false;
    let dirty=false;
    const allFeatures={type:'FeatureCollection',features:(cfg.features||[]).filter(f=>Number(f.id)!==Number(cfg.currentId))};
    const fitAll=document.getElementById('drp033_fit');
    let replacing=false;
    function valid(g){
      if(!g||!['Point','LineString'].includes(g.type))return false;
      const pair=c=>Array.isArray(c)&&c.length===2&&c.every(Number.isFinite)&&c[0]>=-180&&c[0]<=180&&c[1]>=-90&&c[1]<=90;
      return g.type==='Point'?pair(g.coordinates):Array.isArray(g.coordinates)&&g.coordinates.length>=2&&g.coordinates.length<=5000&&g.coordinates.every(pair);
    }
    function one(){return draw.getAll().features;}
    function sync(){
      if(replacing)return;
      const feats=one();
      ta.value=feats.length===1&&valid(feats[0].geometry)?JSON.stringify(feats[0].geometry):'';
      say(feats.length===0?'Brak geometrii. Narysuj punkt lub linię.':feats.length===1?'Geometria gotowa do zapisu.':'Na mapie jest więcej niż jedna geometria. Pozostaw jedną.');
    }
    function fit(){
      const feats=one();if(feats.length!==1)return;
      const g=feats[0].geometry;
      if(g.type==='Point')map.flyTo({center:g.coordinates,zoom:15});
      else if(g.type==='LineString'){
        const bounds=new mapboxgl.LngLatBounds();g.coordinates.forEach(c=>bounds.extend(c));
        map.fitBounds(bounds,{padding:65,maxZoom:16,duration:0});
      }
    }
    function setGeometry(g){
      if(!valid(g)){say('Nieprawidłowy GeoJSON. Dozwolony jest jeden punkt lub linia.');return false;}
      replacing=true;
      draw.deleteAll();draw.add({type:'Feature',properties:{},geometry:g});
      replacing=false;sync();fit();return true;
    }
    map.on('load',()=>{
      loaded=true;
      map.addSource('drp034-existing',{type:'geojson',data:allFeatures});
      map.addLayer({id:'drp034-existing-lines',type:'line',source:'drp034-existing',filter:['==',['geometry-type'],'LineString'],paint:{'line-color':'#2563eb','line-width':5,'line-opacity':0.8}});
      map.addLayer({id:'drp034-existing-points',type:'circle',source:'drp034-existing',filter:['==',['geometry-type'],'Point'],paint:{'circle-radius':7,'circle-color':'#2563eb','circle-stroke-color':'#ffffff','circle-stroke-width':2}});
      for(const layer of ['drp034-existing-lines','drp034-existing-points']){
        map.on('mouseenter',layer,()=>map.getCanvas().style.cursor='pointer');
        map.on('mouseleave',layer,()=>map.getCanvas().style.cursor='');
        map.on('click',layer,e=>{
          if(!e.features||!e.features.length)return;
          const f=e.features[0];
          const id=Number(f.properties.geometry_id);
          if(!Number.isInteger(id)||id<=0)return;
          const name=f.properties.title||'(bez nazwy)';
          if(dirty&&!window.confirm('Masz niezapisane zmiany. Otworzyć inną geometrię i je utracić?'))return;
          window.location.href=cfg.editUrl+encodeURIComponent(String(id));
        });
      }

      if(cfg.geometry)setGeometry(cfg.geometry);
      else {
        say('Kliknij niebieską geometrię, aby ją edytować, lub narysuj nową.');
        if(allFeatures.features.length){
          const b=new mapboxgl.LngLatBounds();
          for(const f of allFeatures.features){const c=f.geometry.coordinates;if(f.geometry.type==='Point')b.extend(c);else if(f.geometry.type==='LineString')for(const pt of c)b.extend(pt);}
          if(!b.isEmpty())map.fitBounds(b,{padding:65,maxZoom:14,duration:0});
        }
      }
      setTimeout(()=>map.resize(),100);
    });
    map.on('draw.create',e=>{
      if(replacing)return;
      const newest=e.features&&e.features[0];
      if(newest){replacing=true;for(const f of one())if(f.id!==newest.id)draw.delete(f.id);replacing=false;}
      dirty=true;sync();
    });
    map.on('draw.update',()=>{dirty=true;sync();});
    map.on('draw.delete',()=>{dirty=true;sync();});
    document.getElementById('drp033_fit').addEventListener('click',fit);
    document.getElementById('drp033_reset').addEventListener('click',()=>{
      if(!window.confirm('Przywrócić geometrię z ostatniego zapisu? Niezapisane zmiany zostaną utracone.'))return;
      if(cfg.geometry)setGeometry(cfg.geometry);else{draw.deleteAll();sync();}dirty=false;
    });
    document.getElementById('drp033_load_json').addEventListener('click',()=>{
      let g;try{g=JSON.parse(ta.value);if(g.type==='Feature')g=g.geometry;}catch(e){say('Nieprawidłowy JSON.');return;}
      if(setGeometry(g))dirty=true;
    });
    document.getElementById('drp033_form').addEventListener('submit',e=>{
      if(!loaded){e.preventDefault();say('Mapa jeszcze się ładuje.');return;}
      const feats=one();
      if(feats.length!==1||!valid(feats[0].geometry)){
        e.preventDefault();say('Przed zapisem pozostaw na mapie dokładnie jeden poprawny punkt lub linię.');return;
      }
      ta.value=JSON.stringify(feats[0].geometry);
      dirty=false;
    });
    if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>{if(loaded)map.resize();}).observe(el);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
JS;
}
add_action('admin_post_drp03_save_geometry', function () {
    if (!current_user_can('edit_posts')) wp_die('Brak uprawnień.');
    check_admin_referer('drp03_save_geometry', 'drp03_nonce');
    global $wpdb; [$geo] = drp03_tables();
    $id = absint($_POST['geometry_id'] ?? 0);
    $existing = $id ? $wpdb->get_var($wpdb->prepare("SELECT id FROM $geo WHERE id=%d", $id)) : null;
    if ($id && !$existing) wp_die('Nie znaleziono geometrii.');
    $raw = isset($_POST['geometry_json']) ? wp_unslash($_POST['geometry_json']) : '';
    $g = drp03_validate_geojson($raw);
    if (is_wp_error($g)) wp_die(esc_html($g->get_error_message()), 'Błąd geometrii', ['back_link'=>true]);
    $title = sanitize_text_field(wp_unslash($_POST['geometry_title'] ?? ''));
    $data = ['title'=>$title, 'geometry_type'=>$g['type'], 'geometry_json'=>wp_json_encode($g), 'updated_at'=>current_time('mysql', true)];
    if ($id) $ok = $wpdb->update($geo, $data, ['id'=>$id]);
    else { $data['created_at'] = current_time('mysql', true); $ok = $wpdb->insert($geo, $data); $id = (int)$wpdb->insert_id; }
    if ($ok === false) wp_die('Błąd zapisu bazy danych.');
    wp_safe_redirect(add_query_arg(['post_type'=>'drp_dasie','page'=>'drp03-geometries','geometry_id'=>$id,'drp03_msg'=>'Zapisano geometrię.'], admin_url('edit.php')));exit;
});

// Usuwanie jest odrębne od kosza Mapbox Draw i nie usuwa wpisów DASIE.
add_action('admin_post_drp035_delete_geometry', function () {
    if (!current_user_can('edit_posts')) wp_die('Brak uprawnień.');
    $id = absint($_POST['geometry_id'] ?? 0);
    if (!$id) wp_die('Nieprawidłowy identyfikator geometrii.');
    check_admin_referer('drp035_delete_geometry_' . $id, 'drp035_delete_nonce');
    $confirmed = trim((string) wp_unslash($_POST['confirm_id'] ?? ''));
    if ($confirmed !== (string) $id) wp_die('Nieprawidłowe potwierdzenie. Geometria nie została usunięta.');
    global $wpdb;
    [$geo, $rel] = drp03_tables();
    $wpdb->query('START TRANSACTION');
    $exists = $wpdb->get_var($wpdb->prepare("SELECT id FROM $geo WHERE id=%d FOR UPDATE", $id));
    if (!$exists) {
        $wpdb->query('ROLLBACK');
        wp_die('Nie znaleziono geometrii.');
    }
    $removed_links = $wpdb->delete($rel, ['geometry_id' => $id], ['%d']);
    $removed_geometry = ($removed_links !== false) ? $wpdb->delete($geo, ['id' => $id], ['%d']) : false;
    if ($removed_links === false || $removed_geometry !== 1) {
        $wpdb->query('ROLLBACK');
        wp_die('Błąd usuwania. Nie zapisano zmian.');
    }
    if ($wpdb->query('COMMIT') === false) wp_die('Nie udało się potwierdzić usunięcia w bazie danych.');
    wp_safe_redirect(add_query_arg([
        'post_type' => 'drp_dasie', 'page' => 'drp03-geometries',
        'drp03_msg' => 'Usunięto geometrię #' . $id . ' oraz ' . (int)$removed_links . ' powiązań. Wpisy DASIE pozostały bez zmian.'
    ], admin_url('edit.php')));
    exit;
});

add_action('add_meta_boxes_drp_dasie', function () {
    add_meta_box('drp03_links', 'Powiązane geometrie DASIE', 'drp03_links_box', 'drp_dasie', 'normal', 'default');
});
function drp03_links_box($post) {
    global $wpdb; [$geo,$rel] = drp03_tables();
    wp_nonce_field('drp03_save_links', 'drp03_links_nonce');
    $selected = array_map('intval', $wpdb->get_col($wpdb->prepare("SELECT geometry_id FROM $rel WHERE dasie_id=%d", $post->ID)));
    $items = $wpdb->get_results("SELECT id,title,geometry_type FROM $geo ORDER BY id DESC LIMIT 500");
    echo '<p>Wybierz jedną lub wiele geometrii. Ten sam punkt lub linia mogą być przypisane do różnych wpisów DASIE.</p>';
    echo '<select name="drp03_geometry_ids[]" multiple size="9" style="width:100%;max-width:650px">';
    foreach ($items as $item) echo '<option value="' . (int)$item->id . '" ' . selected(in_array((int)$item->id, $selected, true), true, false) . '>#' . (int)$item->id . ' — ' . esc_html($item->title ?: '(bez nazwy)') . ' [' . esc_html($item->geometry_type) . ']</option>';
    echo '</select><p class="description">Mac: ⌘ + kliknięcie wybiera wiele pozycji. Brak zaznaczenia usuwa powiązania przy zapisie.</p>';
    echo '<p><a href="' . esc_url(admin_url('edit.php?post_type=drp_dasie&page=drp03-geometries')) . '" target="_blank" rel="noopener">Dodaj lub edytuj geometrię (nowa karta)</a></p>';
}
add_action('save_post_drp_dasie', function ($post_id) {
    if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id)) return;
    if (!isset($_POST['drp03_links_nonce']) || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['drp03_links_nonce'])), 'drp03_save_links')) return;
    if (!current_user_can('edit_post', $post_id)) return;
    global $wpdb; [$geo,$rel] = drp03_tables();
    $ids = isset($_POST['drp03_geometry_ids']) && is_array($_POST['drp03_geometry_ids']) ? array_unique(array_filter(array_map('absint', wp_unslash($_POST['drp03_geometry_ids'])))) : [];
    $wpdb->delete($rel, ['dasie_id'=>$post_id], ['%d']);
    foreach ($ids as $id) {
        $exists = $wpdb->get_var($wpdb->prepare("SELECT id FROM $geo WHERE id=%d", $id));
        if ($exists) $wpdb->insert($rel, ['dasie_id'=>$post_id, 'geometry_id'=>$id], ['%d','%d']);
    }
}, 20);

add_action('before_delete_post', function ($post_id, $post) {
    if ($post->post_type !== 'drp_dasie') return;
    global $wpdb; [, $rel] = drp03_tables();
    $wpdb->delete($rel, ['dasie_id'=>$post_id], ['%d']);
}, 10, 2);
