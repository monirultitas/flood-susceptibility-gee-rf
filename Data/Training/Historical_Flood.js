// Define the study area (Sylhet Division)
var table2 = ee.FeatureCollection("projects/ee-monirirsgis/assets/Sylhet_Division");

// Define the time range for flood detection (2020-2024)
var startDate = '2014-01-01';
var endDate = '2024-12-31';

// Load Sentinel-1 SAR imagery (VV polarization is typically used for flood mapping)
var sentinel1 = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filterBounds(table2) // Filter by study area (Sylhet Division)
  .filterDate(startDate, endDate) // Filter by the date range (2020-2024)
  .filter(ee.Filter.eq('instrumentMode', 'IW'))  // Interferometric Wide swath
  .filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING'))  // Ascending passes
  .select(['VV']);  // VV polarization

// Load CHIRPS precipitation data for flash flood detection
var precipitation = ee.ImageCollection('UCSB-CHG/CHIRPS/PENTAD')
  .filterBounds(table2)
  .filterDate(startDate, endDate);

// Calculate total precipitation for 1-3 days to detect flash floods (example)
var flashFloodPrecipitation = precipitation.filterDate('2020-01-01', '2020-03-01')
  .sum()
  .clip(table2);

// Visualize sample flood image (median composite) from Sentinel-1
var sampleImage = sentinel1.median();  // Median composite to reduce noise
Map.centerObject(table2, 9);  // Center the map on the study area (Sylhet Division)

// Clip the image to the study area (Sylhet Division)
var clippedImage = sampleImage.clip(table2);

// Display the clipped image (flooded area) using a color palette
Map.addLayer(clippedImage, {min: -25, max: 5, palette: ['blue', 'white']}, 'Flood Extent');

// Calculate flood occurrence based on threshold
var floodThreshold = -10;  // Threshold for flood detection based on VV polarization
var floodImage = clippedImage.lt(floodThreshold);  // Pixels with backscatter below the threshold are considered flooded

// Visualize the flooded areas
Map.addLayer(floodImage.mask(floodImage), {palette: ['blue']}, 'Flooded Areas');

// Flash Flood Detection Based on Precipitation Threshold (example)
var flashFloodThreshold = 50;  // Precipitation threshold (mm) for flash floods
var flashFloodImage = flashFloodPrecipitation.gt(flashFloodThreshold);  // Areas with high precipitation indicating flash floods
Map.addLayer(flashFloodImage, {palette: ['red']}, 'Flash Floods');

// Combine Flash Flood and Flooded Areas
var combinedFloodImage = floodImage.add(flashFloodImage);
Map.addLayer(combinedFloodImage, {min: 0, max: 2, palette: ['blue', 'red']}, 'Combined Flood Types');

// Export the flood occurrence data (for analysis)
Export.image.toDrive({
  image: floodImage.updateMask(floodImage).unmask(0).toByte().clip(table2),
  description: 'FloodOccurrence_Sylhet',
  folder: 'FloodData',
  region: table2.geometry(),
  scale: 30,
  maxPixels: 1e13
});

// Add legend for flood types (Flash Floods and Regular Floods)
function addLegend() {
  var legend = ui.Panel({
    style: {position: 'bottom-left', padding: '8px'}
  });

  var legendTitle = ui.Label('Flood Types');
  legend.add(legendTitle);

  var colorLabels = ['Flash Flood', 'Regular Flood', 'Not Flooded'];
  var colorValues = ['red', 'blue', 'white'];

  var colorBoxFlashFlood = ui.Label({
    style: {
      backgroundColor: colorValues[0],
      padding: '8px',
      margin: '2px',
      width: '15px',
      height: '15px'
    }
  });

  var colorBoxFlooded = ui.Label({
    style: {
      backgroundColor: colorValues[1],
      padding: '8px',
      margin: '2px',
      width: '15px',
      height: '15px'
    }
  });

  var colorBoxNotFlooded = ui.Label({
    style: {
      backgroundColor: colorValues[2],
      padding: '8px',
      margin: '2px',
      width: '15px',
      height: '15px'
    }
  });

  var legendRowFlashFlood = ui.Panel({
    widgets: [
      colorBoxFlashFlood,
      ui.Label(colorLabels[0])
    ],
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {stretch: 'horizontal'}
  });

  var legendRowFlooded = ui.Panel({
    widgets: [
      colorBoxFlooded,
      ui.Label(colorLabels[1])
    ],
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {stretch: 'horizontal'}
  });

  var legendRowNotFlooded = ui.Panel({
    widgets: [
      colorBoxNotFlooded,
      ui.Label(colorLabels[2])
    ],
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {stretch: 'horizontal'}
  });

  legend.add(legendRowFlashFlood);
  legend.add(legendRowFlooded);
  legend.add(legendRowNotFlooded);

  Map.add(legend);
}

// Call the function to add the legend
addLegend();
