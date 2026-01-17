// --- Define Study Boundaries ---
// Load the full hydrological basin boundary
var meghnaBasin = ee.FeatureCollection("projects/ee-monirirsgis/assets/Meghna_Basin");
// Load the administrative focus area boundary
var sylhetDivision = ee.FeatureCollection("projects/ee-monirirsgis/assets/Sylhet_Division");

// Center the map approximately between the two extents
Map.centerObject(sylhetDivision, 8);

// Add boundaries to map for reference
Map.addLayer(meghnaBasin, {color: '800080'}, "Meghna Basin Boundary", false);
Map.addLayer(sylhetDivision, {color: 'FFA500'}, "Sylhet Division Boundary");

// --- Load and Prepare DEM ---
// Load Copernicus DEM and clip to Meghna Basin
var dem_Basin = ee.ImageCollection("COPERNICUS/DEM/GLO30")
                  .select('DEM')
                  .mosaic()
                  .clip(meghnaBasin);

// Rename DEM for clarity
var elevation_Basin = dem_Basin.rename('elevation');

// --- Fill Sinks (Simple Approach) ---
var filled_elevation_Basin = elevation_Basin.focal_min(1, 'square', 'pixels')
                                            .focal_max(1, 'square', 'pixels');

// --- Slope and Aspect Calculation ---
var slopeRadians = ee.Terrain.slope(filled_elevation_Basin)
  .multiply(Math.PI / 180);
var aspectRadians = ee.Terrain.aspect(filled_elevation_Basin)
  .multiply(Math.PI / 180);

// --- Gradient of Slope ---
var slopeGradient = slopeRadians.gradient();
var dS_dx = slopeGradient.select('x');
var dS_dy = slopeGradient.select('y');

// --- Profile Curvature Calculation ---
var sinAspect = aspectRadians.sin();
var cosAspect = aspectRadians.cos();
var profileCurvature_Basin = dS_dx.multiply(sinAspect)
                                  .add(dS_dy.multiply(cosAspect))
                                  .rename('profile_curvature');

// --- Visualization Parameters ---
var curvatureViz = {
  min: -0.0001,
  max: 0.0001,
  palette: ['#d7191c', '#fdae61', '#ffffbf', '#abd9e9', '#2c7bb6']
};

// --- Add Profile Curvature Layers ---
Map.addLayer(profileCurvature_Basin.clip(meghnaBasin), curvatureViz, 'Profile Curvature (Meghna Basin)', false);
Map.addLayer(profileCurvature_Basin.clip(sylhetDivision), curvatureViz, 'Profile Curvature (Sylhet Division)');

// --- Legend Creation ---
var legend = ui.Panel({
  style: { position: 'bottom-left', padding: '8px 15px' }
});
var legendTitle = ui.Label({
  value: 'Profile Curvature',
  style: { fontWeight: 'bold', fontSize: '14px', margin: '0 0 4px 0' }
});
legend.add(legendTitle);

var minVal = curvatureViz.min;
var maxVal = curvatureViz.max;
var palette = curvatureViz.palette;
var nSteps = palette.length;
var step = (maxVal - minVal) / nSteps;
var labels = [];

var makeRow = function(color, name) {
  var colorBox = ui.Label({ style: { backgroundColor: color, padding: '8px', margin: '0 0 4px 0' } });
  var description = ui.Label({ value: name, style: { margin: '0 0 4px 6px' } });
  return ui.Panel({ widgets: [colorBox, description], layout: ui.Panel.Layout.Flow('horizontal') });
};

for (var i = 0; i < nSteps; i++) {
  var breakMin = minVal + i * step;
  var breakMax = minVal + (i + 1) * step;
  var label = breakMin.toExponential(1) + ' - ' + breakMax.toExponential(1);
  if (i === 0) label += ' (Convex)';
  if (i === nSteps - 1) label += ' (Concave)';
  labels.push(label);
  legend.add(makeRow(palette[i], label));
}

Map.add(legend);

// --- Optional: Print Min/Max for Sylhet Division ---
var actualMinMaxSylhet = profileCurvature_Basin.reduceRegion({
  reducer: ee.Reducer.minMax(),
  geometry: sylhetDivision.geometry(),
  scale: 30,
  maxPixels: 1e9,
  bestEffort: true
});
print('Actual Profile Curvature Min/Max in Sylhet Division:', actualMinMaxSylhet);
// Export Profile Curvature for Sylhet Division
Export.image.toDrive({
  image: profileCurvature_Basin.clip(sylhetDivision),
  description: 'Profile_Curvature_Sylhet_Division',
  folder: 'GEE_Profile_Curvature',
  fileNamePrefix: 'Profile_Curvature_Sylhet_Division',
  region: sylhetDivision.geometry(),
  scale: 30,
  crs: 'EPSG:4326',
  maxPixels: 1e13
});
