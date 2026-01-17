// --- Define Study Boundaries ---
var meghnaBasin = ee.FeatureCollection("projects/ee-monirirsgis/assets/Meghna_Basin");
var sylhetDivision = ee.FeatureCollection("projects/ee-monirirsgis/assets/Sylhet_Division");

// Center the map on Sylhet Division
Map.centerObject(sylhetDivision, 8);

// Add the boundaries for reference
Map.addLayer(meghnaBasin, {color: '800080'}, "Meghna Basin Boundary", false);
Map.addLayer(sylhetDivision, {color: 'FFA500'}, "Sylhet Division Boundary");

// --- Calculate Distance from River based on Meghna Basin ---
var gsw = ee.Image("JRC/GSW1_3/GlobalSurfaceWater");
var occurrence = gsw.select('occurrence');

// Define water as pixels with occurrence > 50% within the MEGHNA BASIN
var water = occurrence.gt(50).unmask(0).clip(meghnaBasin);

// Invert to get non-water (land) for distance transform
var nonWater = water.not();

// Apply distance transform with a smaller neighborhood (reducing memory load)
var distance = nonWater
  .fastDistanceTransform({
    neighborhood: 512,  // Reduce the search distance in pixels (lower memory footprint)
    units: 'pixels'
  })
  .sqrt() // Square root due to the transform being squared
  .multiply(30) // Multiply by pixel scale (30m for JRC GSW) to get meters
  .rename('Distance_from_River')
  .reproject('EPSG:4326', null, 30);

// --- Classify Distance ---
// Use fewer intervals and memory-efficient classification
var classifiedDistance = distance
  .lt(20).multiply(1) // Class 1: 0 - 20 meters
  .add(distance.gte(20).and(distance.lt(50)).multiply(2)) // Class 2: 20 - 50 meters
  .add(distance.gte(50).and(distance.lt(100)).multiply(3)) // Class 3: 50 - 100 meters
  .add(distance.gte(100).and(distance.lt(200)).multiply(4)) // Class 4: 100 - 200 meters
  .add(distance.gte(200).and(distance.lt(300)).multiply(5)) // Class 5: 200 - 300 meters
  .add(distance.gte(300).and(distance.lt(500)).multiply(6)) // Class 6: 300 - 500 meters
  .add(distance.gte(500).multiply(7)) // Class 7: > 500 meters (far from the river)
  .rename('Distance_Class');

// --- Visualization ---
// Updated color palette based on the new distance classes
var palette = [
  "#08306b", // 1: 0 - 20 m
  "#2171b5", // 2: 20 - 50 m
  "#6baed6", // 3: 50 - 100 m
  "#f7fcb9", // 4: 100 - 200 m
  "#fdae61", // 5: 200 - 300 m
  "#f46d43", // 6: 300 - 500 m
  "#d73027"  // 7: > 500 m
];

var classViz = {min: 1, max: 7, palette: palette};

// --- Add Layers to Map ---
Map.addLayer(
  classifiedDistance.clip(meghnaBasin),
  classViz,
  'Distance Classification (Meghna Basin)',
  false
);

Map.addLayer(
  classifiedDistance.clip(sylhetDivision),
  classViz,
  'Distance Classification (Sylhet Division)' // Focused on the study area
);

// Optional: Add water mask layer for context
Map.addLayer(
  water.selfMask(),
  {palette: ['blue']},
  'Water Mask (Meghna Basin)',
  false
);

// --- Add Legend to Map ---
var labels = [
  '0 - 20 m',
  '20 - 50 m',
  '50 - 100 m',
  '100 - 200 m',
  '200 - 300 m',
  '300 - 500 m',
  '> 500 m'
];

// Create a legend panel
var legend = ui.Panel({
  style: {
    position: 'bottom-left', // Position the legend
    padding: '8px 15px'
  }
});

// Create legend title
var legendTitle = ui.Label({
  value: 'Distance from River',
  style: {
    fontWeight: 'bold',
    fontSize: '14px',
    margin: '0 0 4px 0',
    padding: '0'
  }
});
legend.add(legendTitle); // Add title to the panel

// Function to create a legend row (color box + label)
var makeRow = function(color, name) {
  var colorBox = ui.Label({
    style: {
      backgroundColor: color,
      padding: '8px', // Size of the color box
      margin: '0 0 4px 0' // Spacing
    }
  });
  var description = ui.Label({
    value: name,
    style: {margin: '0 0 4px 6px'} // Spacing to the right of box
  });
  return ui.Panel({
    widgets: [colorBox, description],
    layout: ui.Panel.Layout.Flow('horizontal') // Arrange horizontally
  });
};

// Add color boxes and labels to the legend
for (var i = 0; i < labels.length; i++) {
  legend.add(makeRow(palette[i], labels[i]));
}

// Add the completed legend to the map
Map.add(legend);

// Export Distance Classification for Sylhet Division
Export.image.toDrive({
  image: classifiedDistance.clip(sylhetDivision),
  description: 'Sylhet_Distance_Class',
  folder: 'Thesis_GEE_Exports',
  region: sylhetDivision.geometry(),
  scale: 30,
  maxPixels: 1e9,
  crs: 'EPSG:4326',
  fileFormat: 'GeoTIFF'
});

