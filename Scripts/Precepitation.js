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

// --- Parameters ---
var startDate = '2000-01-01';
var endDate = '2024-12-31'; // Inclusive end date for the period

// --- Load Rainfall Data (CHIRPS Daily) based on Basin ---
print("Loading CHIRPS data for Meghna Basin...");
var chirps = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
                .filterBounds(meghnaBasin.geometry()) // Filter spatially TO THE BASIN
                .filterDate(startDate, endDate); // Filter temporally

// --- Calculate Mean Annual Precipitation for the Basin ---
print("Calculating Mean Annual Precipitation...");
// Calculate the total precipitation over the entire period
var totalPrecipitation_Basin = chirps.sum(); // Sum of daily precipitation in mm

// Calculate the number of years in the period
var startYear = ee.Date(startDate).get('year');
var endYear = ee.Date(endDate).get('year');
var numberOfYears = ee.Number(endYear).subtract(startYear).add(1); // Add 1 for inclusive years

// Calculate Mean Annual Precipitation (Total / Number of Years)
var meanAnnualPrecipitation_Basin = totalPrecipitation_Basin
                                .divide(numberOfYears)
                                .rename('mean_annual_precip_mm');

// --- Visualization ---
// Define FIXED visualization parameters for mean annual precipitation (mm/year)
// You can adjust min/max after inspecting the actual values if needed
var rainfallViz = {
  min: 1500, // Adjusted default min slightly
  max: 5500, // Adjusted default max slightly (Meghna basin can be very wet)
  palette: ['#ffffcc', '#a1dab4', '#41b6c4', '#2c7fb8', '#253494', '#081d58'] // Yellow to Blue palette
};

// --- Add Layers to Map ---
print("Adding layers...");
// Layer 1: Mean Annual Precip clipped to Meghna Basin
Map.addLayer(
    meanAnnualPrecipitation_Basin.clip(meghnaBasin),
    rainfallViz,
    'Mean Annual Precip (Meghna Basin)',
    false // Initially turned off
);

// Layer 2: Mean Annual Precip clipped to Sylhet Division
Map.addLayer(
    meanAnnualPrecipitation_Basin.clip(sylhetDivision),
    rainfallViz,
    'Mean Annual Precip (Sylhet Division)'
);

// --- Add Legend ---
// Define labels for the legend based on the FIXED viz parameters
var min = rainfallViz.min;
var max = rainfallViz.max;
var palette = rainfallViz.palette;
var nSteps = palette.length;
var step = (max - min) / nSteps;
var labels = [];
for (var i = 0; i < nSteps; i++) {
  var breakMin = min + i * step;
  var breakMax = min + (i + 1) * step;
  // Format labels nicely (e.g., integers for mm)
  labels.push(breakMin.toFixed(0) + ' - ' + breakMax.toFixed(0) + ' mm/yr');
}

// Create a legend panel
var legend = ui.Panel({
  style: { position: 'bottom-left', padding: '8px 15px' }
});
// Create legend title
var legendTitle = ui.Label({
  value: 'Mean Annual Precip.',
  style: { fontWeight: 'bold', fontSize: '14px', margin: '0 0 4px 0', padding: '0' }
});
legend.add(legendTitle); // Add title to the panel

// Function to create a legend row
var makeRow = function(color, name) {
  var colorBox = ui.Label({ style: { backgroundColor: color, padding: '8px', margin: '0 0 4px 0' } });
  var description = ui.Label({ value: name, style: { margin: '0 0 4px 6px' } });
  return ui.Panel({ widgets: [colorBox, description], layout: ui.Panel.Layout.Flow('horizontal') });
};

// Add color boxes and labels to the legend
for (var i = 0; i < labels.length; i++) {
  legend.add(makeRow(palette[i], labels[i]));
}

// Add the completed legend to the map
Map.add(legend);
print("Layers and legend added.");

// --- Optional: Print min/max values in the BASIN to help refine visualization ---
var minMaxRain = meanAnnualPrecipitation_Basin.reduceRegion({
    reducer: ee.Reducer.minMax(),
    geometry: meghnaBasin.geometry(), // Calculate over the whole basin
    scale: 5566, // Native CHIRPS resolution is ~5.5km
    maxPixels: 1e10,
    bestEffort: true
});
print('Mean Annual Precipitation (mm/year) Min/Max in Meghna Basin:', minMaxRain);

Export.image.toDrive({
  image: meanAnnualPrecipitation_Basin.clip(sylhetDivision),
  description: 'MeanAnnualPrecip_SylhetDivision',
  folder: 'GEE_exports',
  fileNamePrefix: 'mean_annual_precip_sylhet',
  region: sylhetDivision.geometry(),
  scale: 5566,
  crs: 'EPSG:4326',
  maxPixels: 1e13
});
