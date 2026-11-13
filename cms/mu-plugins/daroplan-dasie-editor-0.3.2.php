<?php
/**
 * Plugin Name: DaRoPlan DASIE Map Editor
 * Description: CMS 0.3.3 — mapa do przypisywania istniejących geometrii (bez Mapbox Draw).
 * Version: 0.3.3
 */
if (!defined('ABSPATH')) exit;

add_action('admin_enqueue_scripts', function ($hook) {
    if (!in_array($hook, ['post.php', 'post-new.php'], true)) return;
    $screen = get_current_screen();
    if (!$screen || $screen->post_type !== 'drp_dasie') return;
    if (!get_option('drp03_map_token', '')) return;
    wp_enqueue_style('drp032-mapbox', 'https://api.mapbox.com/mapbox-gl-js/v3.9.4/mapbox-gl.css', [], '3.9.4');
    wp_enqueue_script('drp032-mapbox', 'https://api.mapbox.com/mapbox-gl-js/v3.9.4/mapbox-gl.js', [], '3.9.4', true);
    wp_register_script('drp032-editor', false, ['drp032-mapbox'], '0.3.3', true);
    wp_enqueue_script('drp032-editor');
    wp_add_inline_script('drp032-editor', drp032_js());
    wp_add_inline_style('drp032-mapbox', '
        #drp032_map { position:relative; width:100%; height:480px; min-height:480px; overflow:hidden; border:1px solid #b8c0c8; box-sizing:border-box; }
        #drp032_map .mapboxgl-map { width:100%; height:100%; }
        #drp032_map .mapboxgl-canvas-container, #drp032_map .mapboxgl-canvas { width:100%; height:100%; }
        #drp032_map .mapboxgl-control-container { position:static; }
        #drp032_status { display:inline-block; margin-left:8px; }
        #drp032_geometry_ids { width:100%; max-width:750px; }
    ');
});

add_action('add_meta_boxes_drp_dasie', function () {
    add_meta_box('drp032_map_box', 'Lokalizacje DASIE — mapa i geometrie', 'drp032_render', 'drp_dasie', 'normal', 'high');
}, 100);
add_action('do_meta_boxes', function ($screen, $context) {
    if ($screen === 'drp_dasie' && $context === 'normal') remove_meta_box('drp03_links', 'drp_dasie', 'normal');
}, 1000, 2);

function drp032_render($post) {
    if (!function_exists('drp03_tables')) {
        echo '<p>Brak wymaganego modułu Geometries 0.3.</p>'; return;
    }
    $token = get_option('drp03_map_token', '');
    if (!$token) { echo '<p>Ustaw publiczny token w DASIE → Ustawienia mapy.</p>'; return; }
    global $wpdb;
    [$geo, $rel] = drp03_tables();
    $items = $wpdb->get_results("SELECT id,title,geometry_type,geometry_json FROM $geo ORDER BY id DESC LIMIT 2000");
    $selected = array_map('intval', $wpdb->get_col($wpdb->prepare("SELECT geometry_id FROM $rel WHERE dasie_id=%d", $post->ID)));
    $features = [];
    foreach ($items as $item) {
        $geometry = json_decode($item->geometry_json, true);
        if (!is_array($geometry) || !in_array($geometry['type'] ?? '', ['Point','LineString'], true)) continue;
        $features[] = ['type'=>'Feature','id'=>(int)$item->id,
            'properties'=>['id'=>(int)$item->id,'title'=>$item->title,'selected'=>in_array((int)$item->id,$selected,true)],
            'geometry'=>$geometry];
    }
    wp_nonce_field('drp03_save_links', 'drp03_links_nonce');
    echo '<p>Kliknij istniejącą geometrię na mapie, aby przypisać ją do wpisu lub odłączyć. Zmiany powiązań utrwalisz po zapisaniu wpisu DASIE. Geometrie twórz i edytuj wyłącznie w DASIE → Geometrie.</p>';
    echo '<div id="drp032_map" aria-label="Mapa wyboru istniejących geometrii DASIE"></div>';
    echo '<p><a class="button" href="'.esc_url(admin_url('edit.php?post_type=drp_dasie&page=drp03-geometries')).'" target="_blank" rel="noopener noreferrer">Otwórz edytor geometrii (nowa karta)</a></p>';
    echo '<p><label for="drp032_geometry_ids"><strong>Powiązane geometrie</strong></label></p>';
    echo '<select id="drp032_geometry_ids" name="drp03_geometry_ids[]" multiple size="7">';
    foreach ($items as $item) {
        echo '<option value="'.(int)$item->id.'" '.selected(in_array((int)$item->id,$selected,true),true,false).'>#'.(int)$item->id.' — '.esc_html($item->title ?: '(bez nazwy)').' ['.esc_html($item->geometry_type).']</option>';
    }
    echo '</select><p class="description">Zaznaczone pozycje odpowiadają obiektom wyróżnionym na mapie. Zapisz wpis DASIE, aby utrwalić zmiany powiązań. Po dodaniu nowej geometrii w drugiej karcie odśwież ten formularz przed przypisaniem (najpierw zapisz ewentualne zmiany wpisu).</p>';
    $config = ['token'=>$token, 'features'=>$features];
    echo '<script type="application/json" id="drp032_config">'.wp_json_encode($config, JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT).'</script>';
}

function drp032_js() { return <<<'JS'
(function(){
  'use strict';
  function init(){
    const el=document.getElementById('drp032_map');
    const cfgEl=document.getElementById('drp032_config');
    if(!el||!cfgEl||el.dataset.initialized==='1')return;
    const status=document.getElementById('drp032_status');
    const select=document.getElementById('drp032_geometry_ids');
    const say=(message)=>{if(status)status.textContent=message;};
    if(typeof mapboxgl==='undefined'){
      say('Błąd ładowania biblioteki Mapbox. Sprawdź konsolę przeglądarki.');return;
    }
    let cfg;
    try{cfg=JSON.parse(cfgEl.textContent);}catch(e){say('Błędna konfiguracja mapy.');return;}
    el.dataset.initialized='1';
    mapboxgl.accessToken=cfg.token;
    let map;
    try{
      map=new mapboxgl.Map({container:el,style:'mapbox://styles/mapbox/light-v11',center:[19.94,50.06],zoom:12});
      map.addControl(new mapboxgl.NavigationControl(),'top-left');
    }catch(e){say('Nie udało się uruchomić mapy: '+e.message);return;}
    const fc={type:'FeatureCollection',features:cfg.features};
    function sync(){
      const chosen=new Set(Array.from(select.selectedOptions).map(o=>Number(o.value)));
      cfg.features.forEach(f=>{f.properties.selected=chosen.has(Number(f.id));});
      if(map.getSource('drp032-existing'))map.getSource('drp032-existing').setData(fc);
    }
    function toggle(id){
      const opt=Array.from(select.options).find(o=>Number(o.value)===Number(id));
      if(!opt)return;opt.selected=!opt.selected;sync();
    }
    select.addEventListener('change',sync);
    map.on('error',e=>{if(e.error)say('Błąd mapy: '+e.error.message);});
    map.on('load',()=>{
      map.addSource('drp032-existing',{type:'geojson',data:fc});
      map.addLayer({id:'drp032-lines',type:'line',source:'drp032-existing',filter:['==',['geometry-type'],'LineString'],paint:{'line-color':['case',['get','selected'],'#e11d48','#2563eb'],'line-width':6}});
      map.addLayer({id:'drp032-points',type:'circle',source:'drp032-existing',filter:['==',['geometry-type'],'Point'],paint:{'circle-radius':7,'circle-color':['case',['get','selected'],'#e11d48','#2563eb'],'circle-stroke-color':'#fff','circle-stroke-width':2}});
      ['drp032-lines','drp032-points'].forEach(layer=>{
        map.on('click',layer,e=>{if(e.features&&e.features.length)toggle(e.features[0].properties.id);});
        map.on('mouseenter',layer,()=>{map.getCanvas().style.cursor='pointer';});
        map.on('mouseleave',layer,()=>{map.getCanvas().style.cursor='';});
      });
      const chosen=cfg.features.filter(f=>f.properties.selected);
      if(chosen.length){
        const bounds=new mapboxgl.LngLatBounds();
        chosen.forEach(f=>{const c=f.geometry.coordinates;if(f.geometry.type==='Point')bounds.extend(c);else c.forEach(p=>bounds.extend(p));});
        if(!bounds.isEmpty())map.fitBounds(bounds,{padding:65,maxZoom:15,duration:0});
      }
      setTimeout(()=>map.resize(),100);
    });
    if(typeof ResizeObserver!=='undefined'){
      const observer=new ResizeObserver(()=>{if(el.offsetWidth&&el.offsetHeight)map.resize();});
      observer.observe(el);
    }
    document.addEventListener('click',e=>{
      if(e.target.closest('.postbox-header,.handlediv'))setTimeout(()=>map.resize(),150);
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else init();
  if(typeof wp!=='undefined'&&wp.domReady)wp.domReady(init);
  window.addEventListener('load',init,{once:true});
})();
JS; }
