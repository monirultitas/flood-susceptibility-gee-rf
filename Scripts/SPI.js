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

// --- Calculate SPI based on Meghna Basin using Copernicus DEM ---

// Load Copernicus GLO-30 DEM Image Collection, select DEM band, mosaic, and clip
print("Loading Copernicus DEM...");
var dem = ee.ImageCollection("COPERNICUS/DEM/GLO30")
            .select('DEM') // Select the elevation band
            .mosaic()      // Mosaic tiles into a single image
            .clip(meghnaBasin); // Clip to the basin boundary
// Map.addLayer(dem, {min:0, max:2000}, 'DEM (Basin)', false); // DEBUG LAYER

// --- 1. Fill Sinks (Simplified - Method Changed) ---
// Using focal_min/focal_max which can sometimes handle flats better than focal_mean
// Using a small radius to primarily fill small pits.
print("Filling sinks...");
var filled_dem = dem.focal_min({radius: 1, units: 'pixels'})
                   .focal_max({radius: 1, units: 'pixels'});
// Map.addLayer(filled_dem, {min:0, max:2000}, 'Filled DEM (Basin)', false); // DEBUG LAYER

// --- 2. Calculate Slope in Radians ---
print("Calculating slope...");
// Calculate slope from the filled DEM and convert degrees to radians
var slopeRadians = ee.Terrain.slope(filled_dem)
  .multiply(Math.PI / 180);
// Map.addLayer(slopeRadians, {min:0, max: 1}, 'Slope (Radians)', false); // DEBUG LAYER

// --- 3. Calculate Flow Accumulation (Simplified Proxy - WARNING!) ---
// WARNING: This method uses a Gaussian kernel convolution as a proxy for
// upstream contributing area. It is NOT hydrologically accurate.
print("WARNING: Using simplified flow accumulation proxy for SPI calculation.");
print("Calculating flow accumulation proxy...");
var flowAccProxy = filled_dem
  .unitScale(0, 4000) // Adjust scale based on DEM elevation range in the basin if needed
  .resample('bilinear') // Resample for smoother convolution input
  .convolve(ee.Kernel.gaussian({ // Gaussian kernel to approximate upstream influence
      radius: 5, // Radius of kernel influence (adjust as needed)
      sigma: 3,  // Sigma of Gaussian (adjust as needed)
      units: 'pixels',
      normalize: true // Normalize kernel weights
  }))
  .multiply(1000) // Scaling factor (adjust if needed)
  .rename("flowacc_proxy");

// Ensure flow accumulation proxy is at least a small positive number
flowAccProxy = flowAccProxy.max(ee.Image(1e-6));
// Map.addLayer(flowAccProxy.log(), {min:0, max:10}, 'Flow Acc Proxy (Log)', false); // DEBUG LAYER

// --- 4. Calculate Stream Power Index (SPI) ---
print("Calculating SPI...");
// SPI = Flow Accumulation * tan(Slope)
var tanSlope = slopeRadians.tan();
// Ensure tanSlope is non-negative (tan of slope 0-90 deg is >= 0)
tanSlope = tanSlope.max(0);

// Multiply the flow accumulation proxy by tan(slope)
var spi_Basin = flowAccProxy.multiply(tanSlope).rename('SPI');
// Map.addLayer(spi_Basin, {min:0, max: 500}, 'SPI (Linear)', false); // DEBUG LAYER

// Calculate Log(SPI) for visualization - Ensure input to log is positive
var logSPI_Basin = spi_Basin.max(1e-12).log().rename('logSPI'); // Added .max(1e-12)

// --- 5. DYNAMIC RANGE CALCULATION START (Based on Basin) ---
// Calculate the 2nd and 98th percentiles of log(SPI) within the MEGHNA BASIN
var scale = 30; // Copernicus DEM scale
print("Calculating dynamic range for log(SPI)...");
var percentiles = logSPI_Basin.reduceRegion({
  reducer: ee.Reducer.percentile([2, 98]), // Calculate 2nd and 98th percentiles
  geometry: meghnaBasin.geometry(), // Use the geometry of the basin
  scale: scale,
  maxPixels: 1e10,
  bestEffort: true // Use bestEffort due to potentially large area
});

// Get the calculated percentile values (client-side)
var spiMin = ee.Number(percentiles.get('logSPI_p2')); // Get the 2nd percentile value
var spiMax = ee.Number(percentiles.get('logSPI_p98')); // Get the 98th percentile value
// --- DYNAMIC RANGE CALCULATION END ---


// --- 6. VISUALIZATION & LEGEND (using basin-wide dynamic range for logSPI) ---
// Use evaluate to wait for min/max values before adding layers and legend
print("Adding layers and legend...");
spiMin.evaluate(function(minVal) {
  spiMax.evaluate(function(maxVal) {
    // Check if minVal or maxVal are null
    if (minVal === null || maxVal === null || minVal === maxVal) {
        print("Error: Could not calculate valid min/max log(SPI) values for the basin.");
        print("Using default range instead.");
        minVal = 0; // Default fallback min for log(SPI)
        maxVal = 10; // Default fallback max for log(SPI)
    } else {
        print("Using dynamic log(SPI) range:", minVal, maxVal);
    }

    // Define visualization parameters USING the dynamic min/max for log(SPI)
    var spiVizLog = {
      min: minVal,
      max: maxVal,
      palette: ['#ffffd4', '#fed98e', '#fe9929', '#d95f0e', '#993404'] // Yellow to Brown/Red
    };

    // --- Add Layers to Map ---

    // Layer 1: Log(SPI) clipped to Meghna Basin
    Map.addLayer(
        logSPI_Basin.clip(meghnaBasin),
        spiVizLog,
        'log(SPI) (Meghna Basin - Dynamic Range)',
        false // Initially turned off
    );

    // Layer 2: Log(SPI) clipped to Sylhet Division
    Map.addLayer(
        logSPI_Basin.clip(sylhetDivision),
        spiVizLog,
        'log(SPI) (Sylhet Division - Dynamic Range)'
    );

    // --- Add Legend ---
    var legend = ui.Panel({
      style: { position: 'bottom-left', padding: '8px 15px' }
    });
    var legendTitle = ui.Label({
      value: 'log(SPI) (Approx)', // Indicate log scale and approximation
      style: { fontWeight: 'bold', fontSize: '14px', margin: '0 0 4px 0', padding: '0' }
    });
    legend.add(legendTitle);

    // Calculate approximate breaks for the legend based on dynamic range
    var palette = spiVizLog.palette;
    var nSteps = palette.length;
    var step = (nSteps > 0 && maxVal > minVal) ? (maxVal - minVal) / nSteps : 0;
    var labels = [];
    if (step > 0) {
        for (var i = 0; i < nSteps; i++) {
          var breakMin = minVal + i * step;
          var breakMax = minVal + (i + 1) * step;
          // Format labels nicely (e.g., 1 decimal place for log values)
          labels.push(breakMin.toFixed(1) + ' - ' + breakMax.toFixed(1));
        }
    } else {
        labels.push(minVal.toFixed(1)); // Handle case where min = max
    }

    // Function to create a legend row
    var makeRow = function(color, name) {
      var colorBox = ui.Label({ style: { backgroundColor: color, padding: '8px', margin: '0 0 4px 0' } });
      var description = ui.Label({ value: name, style: { margin: '0 0 4px 6px' } });
      return ui.Panel({ widgets: [colorBox, description], layout: ui.Panel.Layout.Flow('horizontal') });
    };

    // Add color boxes and labels to the legend
    var numLegendEntries = (step > 0) ? nSteps : 1;
     for (var i = 0; i < numLegendEntries; i++) {
        var colorIndex = Math.min(i, palette.length - 1);
        legend.add(makeRow(palette[colorIndex], labels[i]));
     }

    Map.add(legend); // Add the legend to the map
    print("Layers and legend added.");
  });
});
Export.image.toDrive({
  image: logSPI_Basin.clip(sylhetDivision),
  description: 'Log_SPI_SylhetDivision',
  folder: 'GEE_exports',
  fileNamePrefix: 'logSPI_SylhetDivision',
  region: sylhetDivision.geometry(),
  scale: 30,
  crs: 'EPSG:4326',
  maxPixels: 1e13
});
