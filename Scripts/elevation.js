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

// --- Load and Prepare DEM based on Basin ---
// Load Copernicus GLO-30 DEM Image Collection, select DEM band, mosaic, and clip
print("Loading Copernicus DEM...");
var dem_Basin = ee.ImageCollection("COPERNICUS/DEM/GLO30")
                  .select('DEM') // Select the elevation band
                  .mosaic()      // Mosaic tiles into a single image
                  .clip(meghnaBasin); // Clip to the basin boundary

// Elevation is the DEM itself
var elevation_Basin = dem_Basin.rename('elevation'); // Rename band for clarity

// --- Visualization Parameters for Elevation ---
// Define fixed visualization parameters for Elevation (meters)
var elevationViz = {
  min: 0,
  max: 2500, // Adjust based on actual max elevation in the basin
  palette: ['#006633', '#E5FFCC', '#FFAA00', '#A52A2A', '#FFFFFF'] // Dark Green, Light Green, Orange, Brown, White
};

// --- Add Elevation Layers to Map ---
print("Adding elevation layers...");
// Layer 1: Elevation clipped to Meghna Basin
Map.addLayer(
    elevation_Basin.clip(meghnaBasin),
    elevationViz,
    'Elevation (Meghna Basin)',
    false // Initially turned off
);
// Layer 2: Elevation clipped to Sylhet Division
Map.addLayer(
    elevation_Basin.clip(sylhetDivision),
    elevationViz,
    'Elevation (Sylhet Division)'
);

// --- Add Elevation Legend ---
print("Adding elevation legend...");

// Function to create a generic legend
var createLegend = function(title, vizParams) {
  var legend = ui.Panel({
    style: { position: 'bottom-left', padding: '8px 15px' } // Position legend
  });
  var legendTitle = ui.Label({
    value: title,
    style: { fontWeight: 'bold', fontSize: '14px', margin: '0 0 4px 0', padding: '0' }
  });
  legend.add(legendTitle);

  var min = vizParams.min;
  var max = vizParams.max;
  var palette = vizParams.palette;
  var nSteps = palette.length;
  // Avoid division by zero if max <= min
  var step = (max > min && nSteps > 0) ? (max - min) / nSteps : 0;

  // Function to create a legend row
  var makeRow = function(color, name) {
    var colorBox = ui.Label({ style: { backgroundColor: color, padding: '8px', margin: '0 0 4px 0' } });
    var description = ui.Label({ value: name, style: { margin: '0 0 4px 6px' } });
    return ui.Panel({ widgets: [colorBox, description], layout: ui.Panel.Layout.Flow('horizontal') });
  };

  // Add color boxes and labels
  if (step > 0) {
      for (var i = 0; i < nSteps; i++) {
        var breakMin = min + i * step;
        var breakMax = min + (i + 1) * step;
        var label;
        // Adjust label formatting
        var unit = ' m'; // Units for elevation
        label = breakMin.toFixed(0) + ' - ' + breakMax.toFixed(0) + unit;
        // Optional: Adjust last label to be ">"
        // if (i === nSteps - 1) {
        //     label = '> ' + breakMin.toFixed(0) + unit;
        // }
        legend.add(makeRow(palette[i], label));
      }
  } else { // Handle case where max <= min or zero steps
      legend.add(makeRow(palette[0] || '#000000', min.toFixed(0) + ' m'));
  }
  return legend;
};

// Create and add Elevation Legend
var elevationLegend = createLegend('Elevation', elevationViz);
Map.add(elevationLegend);

// --- Optional: Print Min/Max values in the Basin ---
print("Calculating Elevation Min/Max for verification (may take time)...");
var elevationMinMax = elevation_Basin.reduceRegion({
    reducer: ee.Reducer.minMax(),
    geometry: meghnaBasin.geometry(),
    scale: 90, // Use a larger scale for faster calculation over large area
    maxPixels: 1e9,
    bestEffort: true
});
print('Elevation Min/Max in Meghna Basin:', elevationMinMax);

// Example export code to add at the end of your script
Export.image.toDrive({
  image: elevation_Basin.clip(sylhetDivision),
  description: 'Sylhet_Elevation',
  folder: 'Thesis_GEE_Exports',
  region: sylhetDivision.geometry(),
  scale: 30,
  maxPixels: 1e9
});
