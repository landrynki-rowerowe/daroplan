// Publiczny token Mapbox — taki sam typ jak w aktualnym DaRoPlanie.
// Sekretnych tokenów (sk.*) nigdy nie umieszczaj w JavaScript przeglądarki.
window.DAROPLAN_CONFIG = {
  token: 'pk.eyJ1IjoiaWJpa2VrcmsiLCJhIjoiY2puN2k4Y3l5NGQwejN3bzhpNXZ2NHExNyJ9.WUxF7O_9gk3Lli0oIMjkEw',
  basemaps: {
    original:'mapbox://styles/ibikekrk/ckk79v1nk06y617o6t7xy00ck',
    light:'mapbox://styles/mapbox/light-v11',
    satellite:'mapbox://styles/mapbox/satellite-streets-v12'
  },
  home: [19.94765281677246,50.061712298362735],
  zoom:12,
  analysisUrl:'https://rowerowy.otwartyplan.org/dane/',
  infrastructureUrl:'https://rowerowy.otwartyplan.org/dane/infrastruktura/'
};
