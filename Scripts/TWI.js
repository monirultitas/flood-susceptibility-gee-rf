// --- Define Study Boundaries ---
// Load the full hydrological basin boundary
var meghnaBasin = ee.FeatureCollection("projects/ee-monirirsgis/assets/Meghna_Basin");
// Load the administrative focus area boundary
var sylhetDivision = ee.FeatureCollection("projects/ee-monirirsgis/assets/Sylhet_Division");

// Center the map approximately between the two extents
Map.centerObject(sylhetDivision, 8);

// Add boundaries to map
Map.addLayer(meghnaBasin, {color: '800080'}, "Meghna Basin Boundary", false);
Map.addLayer(sylhetDivision, {color: 'FFA500'}, "Sylhet Division Boundary");

// --- DEM and Slope Calculation ---
var dem = ee.Image("USGS/SRTMGL1_003").clip(meghnaBasin);
var slopeRad = ee.Terrain.slope(dem).multiply(Math.PI).divide(180);

// --- Slope Correction ---
var minSlopeDegrees = 0.05;
var minSlopeThresholdRad = ee.Number(minSlopeDegrees).multiply(Math.PI).divide(180);
var slopeRadAdjusted = slopeRad.max(minSlopeThresholdRad);

// --- Depression Filling (Simple) ---
var filled_dem = dem.focal_min(1); // Simple depression fill proxy

// --- Approximate Flow Accumulation (Simplified Proxy) ---
print("WARNING: Using simplified flow accumulation proxy for TWI calculation.");
var flowAcc = filled_dem
  .unitScale(0, 1000)
  .resample('bilinear')
  .convolve(ee.Kernel.gaussian(3, 3))
  .multiply(1000)
  .rename("flowacc");
flowAcc = flowAcc.max(ee.Image(1e-6)); // Avoid divide-by-zero

// --- TWI Calculation ---
var tanSlopeAdjusted = slopeRadAdjusted.tan();
var twi_Basin = flowAcc.add(1).divide(tanSlopeAdjusted.add(0.0001)).log().rename('TWI');

// --- Dynamic Range Calculation (2nd - 98th Percentile) ---
var scale = 30;
var percentiles = twi_Basin.reduceRegion({
  reducer: ee.Reducer.percentile([2, 98]),
  geometry: meghnaBasin.geometry(),
  scale: scale,
  maxPixels: 1e10
});
var twiMin = ee.Number(percentiles.get('TWI_p2'));
var twiMax = ee.Number(percentiles.get('TWI_p98'));

// --- Visualization and Legend ---
print("Calculating dynamic range and adding layers...");
twiMin.evaluate(function(minVal) {
  twiMax.evaluate(function(maxVal) {
    if (minVal === null || maxVal === null) {
        print("Error: Could not calculate valid min/max TWI values.");
        minVal = 0;
        maxVal = 15;
    } else {
        print("Using dynamic TWI range:", minVal, maxVal);
    }

    var twiViz = {
      min: minVal,
      max: maxVal,
      palette: ['#F7FBFF', '#C6DBEF', '#9ECAE1', '#6BAED6', '#3182BD', '#08519C']
    };

    // Add TWI Layers
    Map.addLayer(
        twi_Basin.clip(meghnaBasin),
        twiViz,
        'TWI (Meghna Basin - Dynamic Range)',
        false
    );
    Map.addLayer(
        twi_Basin.clip(sylhetDivision),
        twiViz,
        'TWI (Sylhet Division - Dynamic Range)'
    );

    // --- Legend Panel ---
    var legend = ui.Panel({
      style: { position: 'bottom-left', padding: '8px 15px' }
    });

    legend.add(ui.Label({
      value: 'TWI (Dynamic Range)',
      style: { fontWeight: 'bold', fontSize: '14px', margin: '0 0 4px 0', padding: '0' }
    }));

    var palette = twiViz.palette;
    var nSteps = palette.length;
    var step = (nSteps > 0 && maxVal > minVal) ? (maxVal - minVal) / nSteps : 0;
    var labels = [];

    if (step > 0) {
        for (var i = 0; i < nSteps; i++) {
          var breakMin = minVal + i * step;
          var breakMax = minVal + (i + 1) * step;
          labels.push(breakMin.toFixed(1) + ' - ' + breakMax.toFixed(1));
        }
    } else {
        labels.push(minVal.toFixed(1));
    }

    var makeRow = function(color, name) {
      var colorBox = ui.Label({ style: { backgroundColor: color, padding: '8px', margin: '0 0 4px 0' } });
      var description = ui.Label({ value: name, style: { margin: '0 0 4px 6px' } });
      return ui.Panel({ widgets: [colorBox, description], layout: ui.Panel.Layout.Flow('horizontal') });
    };

    for (var i = 0; i < labels.length; i++) {
        var colorIndex = Math.min(i, palette.length - 1);
        legend.add(makeRow(palette[colorIndex], labels[i]));
    }

    Map.add(legend);
    print("Layers and legend added.");
  });
});

// --- OPTIONAL: Export TWI for Sylhet Division ---

Export.image.toDrive({
  image: twi_Basin.clip(sylhetDivision),
  description: 'TWI_Sylhet_Dynamic',
  folder: 'GEE_TWI',
  fileNamePrefix: 'TWI_Sylhet',
  region: sylhetDivision.geometry(),
  scale: 30,
  maxPixels: 1e13
});

