<?php
/**
 * Plugin Name: DaRoPlan — CORS dla publicznego API Landrynek
 * Description: Korekta nagłówka origin HTTPS dla żądań mapy DaRoPlan.
 * Version: 0.1.0
 */
if (!defined('ABSPATH')) exit;

// Nie modyfikujemy endpointu, odpowiedzi JSON ani uprawnień WordPressa.
// rest_pre_serve_request jest wykonywany tuż przed wysłaniem odpowiedzi REST.
add_filter('rest_pre_serve_request', function ($served, $result, $request, $server) {
    if (!$request instanceof WP_REST_Request) return $served;
    $route = $request->get_route();
    if (!preg_match('#^/daroplan/v1/landrynki(?:/[0-9]+)?$#D', $route)) return $served;

    $origin = isset($_SERVER['HTTP_ORIGIN']) ? (string) $_SERVER['HTTP_ORIGIN'] : '';
    if ($origin !== 'https://rowerowy.otwartyplan.org') return $served;

    // Nadpisz błędny HTTP origin pochodzący ze starszej konfiguracji.
    header('Access-Control-Allow-Origin: https://rowerowy.otwartyplan.org', true);
    header('Vary: Origin', false);
    return $served;
}, PHP_INT_MAX, 4);
