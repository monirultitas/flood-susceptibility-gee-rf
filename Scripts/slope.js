// =============================================
// IMPROVED SLOPE CLASSIFICATION FOR SYLHET DIVISION
// Now auto-adapts to max slope (58°) and fixes statistics
// =============================================

// --- Load Data ---
var dem = ee.Image("USGS/SRTMGL1_003");
var meghnaBasin = ee.FeatureCollection("projects/ee-monirirsgis/assets/Meghna_Basin");
var sylhetDivision = ee.FeatureCollection("projects/ee-monirirsgis/assets/Sylhet_Division");

// --- Calculate Slope ---
var slope = ee.Terrain.slope(dem).clip(meghnaBasin);
var slopeSylhet = slope.clip(sylhetDivision);

// --- Get Slope Statistics ---
var slopeStats = slopeSylhet.reduceRegion({
  reducer: ee.Reducer.minMax().combine(ee.Reducer.mean(), null, true),
  geometry: sylhetDivision,
  scale: 30,
  bestEffort: true
});
var maxSlope = ee.Number(slopeStats.get('slope_max')).getInfo(); // Actual max: 58°
print("Slope Statistics (Sylhet)", {
  'Min slope': slopeStats.get('slope_min'),
  'Max slope': maxSlope,
  'Mean slope': slopeStats.get('slope_mean')
});

// --- Define Dynamic Slope Classes ---
var classBreaks = [1, 3, 8, 15, 30]; // Added 30° break for very steep terrain
if (maxSlope > 30) classBreaks.push(maxSlope); // Extend breaks if needed

// Hazard-aware color palette (now with 6 classes)
var classPalette = [
  '#4dac26',  // 0-1°: Green (Floodplains)
  '#b8e186',  // 1-3°: Light green (Agriculture)
  '#f1b6da',  // 3-8°: Pink (Moderate)
  '#d01c8b',  // 8-15°: Magenta (High risk)
  '#9e017f',  // 15-30°: Dark purple (Very high)
  '#4d004b'   // >30°: Black (Extreme)
];

// --- Reclassify Slope ---
var classifiedSlope = ee.Image(0).byte().rename('classification');

// Assign classes (1-6)
classifiedSlope = classifiedSlope.where(slopeSylhet.lte(classBreaks[0]), 1);
for (var i = 0; i < classBreaks.length - 1; i++) {
  classifiedSlope = classifiedSlope.where(
    slopeSylhet.gt(classBreaks[i]).and(slopeSylhet.lte(classBreaks[i+1])),
    i + 2
  );
}
classifiedSlope = classifiedSlope.where(slopeSylhet.gt(classBreaks[classBreaks.length - 1]), classBreaks.length + 1);

// --- Visualization ---
Map.centerObject(sylhetDivision, 9);
Map.addLayer(classifiedSlope.selfMask(), {
  min: 1,
  max: classBreaks.length + 1,
  palette: classPalette
}, 'Slope Hazard Classes');

// --- Enhanced Legend (Now Shows 58° Max) ---
var legend = ui.Panel({
  style: {
    position: 'bottom-left',
    padding: '10px',
    backgroundColor: 'white',
    border: '1px solid #ddd'
  }
});

legend.add(ui.Label({
  value: 'SLOPE HAZARD CLASSES (Max: ' + maxSlope.toFixed(1) + '°)',
  style: {
    fontWeight: 'bold',
    fontSize: '14px',
    margin: '0 0 8px 0',
    textAlign: 'center'
  }
}));

// Dynamic legend labels
var labels = [
  '0-1°: Floodplains (Safe)',
  '1-3°: Gentle (Agriculture)',
  '3-8°: Moderate (Caution)',
  '8-15°: Steep (High Risk)',
  '15-30°: Very Steep',
  '>30°: Extreme (' + maxSlope.toFixed(1) + '° max)'
];

for (var i = 0; i < classPalette.length; i++) {
  var colorBox = ui.Label({
    style: {
      backgroundColor: classPalette[i],
      padding: '12px',
      margin: '0 8px 4px 0'
    }
  });
  
  var description = ui.Label({
    value: labels[i],
    style: {fontSize: '12px'}
  });
  
  legend.add(ui.Panel({
    widgets: [colorBox, description],
    layout: ui.Panel.Layout.Flow('horizontal')
  }));
}

Map.add(legend);

// --- Corrected Critical Area Calculation ---
var criticalArea = classifiedSlope.gte(4) // Classes 4+ (8°+ slopes)
  .multiply(ee.Image.pixelArea())
  .rename('area');

var areaStats = criticalArea.reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: sylhetDivision,
  scale: 30,
  maxPixels: 1e9
});

var totalArea = sylhetDivision.geometry().area();
var criticalPercent = ee.Number(areaStats.get('area')).divide(totalArea).multiply(100);

print('Area >8° slope:', criticalPercent.round(), '%');

Export.image.toDrive({
  image: classifiedSlope.clip(sylhetDivision),
  description: 'SlopeHazardClasses_SylhetDivision',
  folder: 'GEE_exports',
  fileNamePrefix: 'slope_hazard_classes_sylhet',
  region: sylhetDivision.geometry(),
  scale: 30,
  crs: 'EPSG:4326',
  maxPixels: 1e13
});
