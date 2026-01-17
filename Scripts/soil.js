// --- Define Study Boundaries ---
// Load the full hydrological basin boundary
var meghnaBasin = ee.FeatureCollection("projects/ee-monirirsgis/assets/Meghna_Basin");
// Load the administrative focus area boundary
var sylhetDivision = ee.FeatureCollection("projects/ee-monirirsgis/assets/Sylhet_Division");

// Center the map approximately between the two extents
Map.centerObject(sylhetDivision, 8); // Center on Sylhet Division, zoomed out a bit

// Add boundaries to map for reference
Map.addLayer(meghnaBasin, {color: '800080'}, "Meghna Basin Boundary", false); // Purple outline
Map.addLayer(sylhetDivision, {color: 'FFA500'}, "Sylhet Division Boundary"); // Orange outline

// --- Load Soil Properties (SoilGrids Clay, Sand, Silt - Correct Paths & Type) ---
// Using SoilGrids 250m v2.0 data. Resolution is 250m.
// Loading the Images for mean values for 0-5cm depth. Units are g/kg (permille).
print("Loading SoilGrids property images...");
var clayImage = ee.Image("projects/soilgrids-isric/clay_mean"); // Load as Image
var sandImage = ee.Image("projects/soilgrids-isric/sand_mean"); // Load as Image
var siltImage = ee.Image("projects/soilgrids-isric/silt_mean"); // Load as Image

// Select topsoil band, convert permille to percent, rename, and clip to BASIN
print("Preparing soil property bands...");
var clay = clayImage.select('clay_0-5cm_mean').divide(10.0).rename('clay'); // Clay %
var sand = sandImage.select('sand_0-5cm_mean').divide(10.0).rename('sand'); // Sand %
var silt = siltImage.select('silt_0-5cm_mean').divide(10.0).rename('silt'); // Silt %

// Combine into a single 3-band image, clipped to the Meghna Basin
var soilProperties_Basin = ee.Image.cat([clay, sand, silt]).clip(meghnaBasin);

// --- Derive USDA Texture Class using Texture Triangle Logic ---
print("Deriving texture classes...");
// Function implementing the USDA Soil Texture Triangle logic
// Takes an image with 'clay', 'sand', 'silt' bands (in percent)
// Returns an image with class codes (1-12)
function getTextureClass(image) {
  var clay = image.select('clay');
  var sand = image.select('sand');
  var silt = image.select('silt');
  var texture = image.select('clay').multiply(0); // Base image of zeros
  // Apply USDA Texture Triangle Rules (using nested .where())
  texture = texture.where(sand.add(silt).lt(15).and(clay.gte(85)), 1);
  texture = texture.where(silt.add(clay.multiply(1.5)).lt(15), 12);
  texture = texture.where(silt.add(clay.multiply(1.5)).gte(15).and(silt.add(clay.multiply(2)).lt(30)), 11);
  texture = texture.where(clay.gte(7).and(clay.lt(20)).and(sand.gt(52)).and(silt.add(clay.multiply(2)).gte(30)), 9);
  texture = texture.where(clay.lt(7).and(silt.lt(50)).and(silt.add(clay.multiply(2)).gte(30)), 9);
  texture = texture.where(clay.gte(7).and(clay.lt(27)).and(silt.gte(28)).and(silt.lt(50)).and(sand.lte(52)), 7);
  texture = texture.where(silt.gte(50).and(clay.gte(12)).and(clay.lt(27)), 8);
  texture = texture.where(silt.gte(50).and(clay.lt(12)), 8);
  texture = texture.where(silt.gte(80).and(clay.lt(12)), 10);
  texture = texture.where(clay.gte(20).and(clay.lt(35)).and(silt.lt(28)).and(sand.gt(45)), 6);
  texture = texture.where(clay.gte(20).and(clay.lt(35)).and(silt.gte(28)).and(sand.lte(45)), 4);
  texture = texture.where(clay.gte(27).and(clay.lt(40)).and(sand.gt(20)).and(sand.lte(45)), 5);
  texture = texture.where(clay.gte(27).and(clay.lt(40)).and(sand.lte(20)), 5);
  texture = texture.where(clay.gte(35).and(sand.gt(45)), 3);
  texture = texture.where(clay.gte(40).and(silt.gte(40)), 2);
  texture = texture.where(clay.gte(40).and(sand.lte(45)).and(silt.lt(40)), 1);
  return texture.rename('usda_texture_class').toByte();
}

// Apply the function to derive texture class for the basin
var soilTexture_Basin = getTextureClass(soilProperties_Basin);

// --- Visualization ---
// Define a discrete color palette for the 12 classes
var soilPalette = [
  '#a50026', '#d73027', '#f46d43', '#fdae61', '#fee090', '#ffffbf',
  '#e0f3f8', '#abd9e9', '#74add1', '#4575b4', '#313695', '#542788'
];
// Define visualization parameters using the palette
var soilViz = {
  min: 1, max: 12, palette: soilPalette
};

// --- Add Layers to Map ---
print("Adding layers...");
// Layer 1: Derived Texture Class clipped to Meghna Basin
Map.addLayer(
    soilTexture_Basin.clip(meghnaBasin), // Clip the derived texture
    soilViz,
    'Soil Texture Class (Meghna Basin)',
    false // Initially turned off
);

// Layer 2: Derived Texture Class clipped to Sylhet Division
Map.addLayer(
    soilTexture_Basin.clip(sylhetDivision), // Clip the derived texture
    soilViz,
    'Soil Texture Class (Sylhet Division)'
);

// --- Add Legend ---
var legend = ui.Panel({ style: { position: 'bottom-right', padding: '8px 15px' } });
var legendTitle = ui.Label({ value: 'Soil Texture (USDA - Derived)', style: { fontWeight: 'bold', fontSize: '14px', margin: '0 0 4px 0', padding: '0' } });
legend.add(legendTitle);
var labels = [
  '1: Clay', '2: Silty clay', '3: Sandy clay', '4: Clay loam',
  '5: Silty clay loam', '6: Sandy clay loam', '7: Loam', '8: Silty loam',
  '9: Sandy loam', '10: Silt', '11: Loamy sand', '12: Sand'
];
// Function to create a legend row
var makeRow = function(color, name) {
  var colorBox = ui.Label({ style: { backgroundColor: color, padding: '8px', margin: '0 0 4px 0' } });
  var description = ui.Label({ value: name, style: { margin: '0 0 4px 6px', fontSize: '12px' } });
  return ui.Panel({ widgets: [colorBox, description], layout: ui.Panel.Layout.Flow('horizontal') });
};
// Add rows to the legend
for (var i = 0; i < labels.length; i++) {
  legend.add(makeRow(soilPalette[i], labels[i]));
}
Map.add(legend); // Add legend to map

// Print the final image properties
print('Derived Soil Texture Image:', soilTexture_Basin);

// --- Optional: Add individual property layers (clipped to Sylhet Division) ---
/*
Map.addLayer(clay.clip(sylhetDivision), {min: 0, max: 60, palette: ['#ffffcc','#c2e699','#78c679','#31a354','#006837']}, "Clay (%) - Sylhet", false);
Map.addLayer(silt.clip(sylhetDivision), {min: 0, max: 60, palette: ['#f7fcb9','#addd8e','#31a354']}, "Silt (%) - Sylhet", false);
Map.addLayer(sand.clip(sylhetDivision), {min: 0, max: 90, palette: ['#fdd49e','#fdbb84','#e34a33']}, "Sand (%) - Sylhet", false);
*/
// Define Region of Interest (Sylhet Division)
var sylhetDivision = ee.FeatureCollection("projects/ee-monirirsgis/assets/Sylhet_Division");

// Import Soil Texture Class Map (from previous code)
var soilTexture_Basin = getTextureClass(soilProperties_Basin);

// Export the soil texture class map for Sylhet Division
Export.image.toDrive({
  image: soilTexture_Basin.clip(sylhetDivision),  // Clip to Sylhet Division
  description: "Soil_Texture_Class_Sylhet",  // Export file name
  folder: "GEE_Exports",  // Folder in Google Drive
  region: sylhetDivision.geometry(),  // Export region (Sylhet Division boundary)
  scale: 250,  // Scale (resolution of 250m from SoilGrids data)
  maxPixels: 1e13,  // Max number of pixels for export
  crs: 'EPSG:4326',  // Coordinate reference system (WGS 84)
  fileFormat: 'GeoTIFF'  // File format (GeoTIFF)
});

// 1. Calculate area covered by each soil texture class in Sylhet Division
var soilClassArea = soilTexture_Basin.clip(sylhetDivision)
  .reduceRegion({
    reducer: ee.Reducer.frequencyHistogram(),  // Frequency histogram for each class
    geometry: sylhetDivision.geometry(),
    scale: 250,  // Resolution for calculation
    maxPixels: 1e9
  });

// Print the area covered by each soil texture class
print("Soil Class Area (Frequency Histogram):", soilClassArea);

// 2. Calculate the total area of Sylhet Division for context
var totalArea = sylhetDivision.geometry().area();
print("Total Area of Sylhet Division (m²):", totalArea);

// 3. Calculate the area covered by each soil texture class in percentage
var soilClassAreaInPercent = ee.Dictionary(soilClassArea.get('usda_texture_class'))
  .map(function(key, value) {
    return ee.Number(value).divide(ee.Number(totalArea)).multiply(100);
  });

// Print the area covered by each soil texture class in percentage
print("Percentage Area Covered by Each Soil Class (in %):", soilClassAreaInPercent);

// 4. Visualize the soil texture classes in Sylhet Division
Map.centerObject(sylhetDivision, 9);
var soilPalette = [
  '#a50026', '#d73027', '#f46d43', '#fdae61', '#fee090', '#ffffbf',
  '#e0f3f8', '#abd9e9', '#74add1', '#4575b4', '#313695', '#542788'
];

var soilViz = {
  min: 1, max: 12, palette: soilPalette
};

Map.addLayer(
  soilTexture_Basin.clip(sylhetDivision),  // Clip to Sylhet Division
  soilViz,
  'Soil Texture Class (Sylhet Division)',
  false // Initially turned off
);
