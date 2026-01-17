// STEP 1: Import ROI and Predictor Layers
var ROI = ee.FeatureCollection("projects/ee-monirirsgis/assets/Sylhet_Division");

var predictors = ee.Image.cat([
  ee.Image("projects/ee-monirirsgis/assets/Distance_From_River"),
  ee.Image("projects/ee-monirirsgis/assets/MeanAnnualPrecip_SylhetDivision"),
  ee.Image("projects/ee-monirirsgis/assets/LULC_Classification_Sylhet_2024"),
  ee.Image("projects/ee-monirirsgis/assets/Sylhet_Elevation"),
  ee.Image("projects/ee-monirirsgis/assets/Profile_Curvature_Sylhet_Division"),
  ee.Image("projects/ee-monirirsgis/assets/TWI_Sylhet_Dynamic"),
  ee.Image("projects/ee-monirirsgis/assets/SlopeHazardClasses_SylhetDivision"),
  ee.Image("projects/ee-monirirsgis/assets/SPI_SylhetDivision"),
  ee.Image("projects/ee-monirirsgis/assets/Soil_Texture_Class_Sylhet")
]).clip(ROI);

// STEP 2: Load Flood Frequency Layer and Define Label
// Assuming flood_label = 1 for flood (positive class), 0 for non-flood (negative class)
var floodFrequency = ee.Image("projects/ee-monirirsgis/assets/FloodOccurrence").clip(ROI);
var label = floodFrequency.gte(1).rename("flood_label");

// STEP 3: Stack predictors and label
var stack = predictors.addBands(label);

// STEP 4: Sample flood and non-flood points
// Added geometries: true for potential future use if needed for spatial operations on samples
var floodPoints = stack.updateMask(label.eq(1)).sample({
  region: ROI.geometry(), // Use geometry for sampling within the ROI
  scale: 30,
  numPixels: 500,
  seed: 1,
  geometries: true
});
var nonFloodPoints = stack.updateMask(label.eq(0)).sample({
  region: ROI.geometry(), // Use geometry for sampling within the ROI
  scale: 30,
  numPixels: 500,
  seed: 2,
  geometries: true
});
var allSamples = floodPoints.merge(nonFloodPoints);

// STEP 5: Split samples into training and testing sets
var withRandom = allSamples.randomColumn('random', 42); // Seed for reproducibility
var trainingPoints = withRandom.filter(ee.Filter.lt('random', 0.7));
var testingPoints = withRandom.filter(ee.Filter.gte('random', 0.7));

print('▶ Total Sample Points:', allSamples.size());
print('▶ Training Points:', trainingPoints.size());
print('▶ Testing Points:', testingPoints.size());

// STEP 6: Train the Random Forest Classifier (Probability Mode for Mapping)
var probClassifier = ee.Classifier.smileRandomForest(100)
  .setOutputMode('PROBABILITY')
  .train({
    features: trainingPoints,
    classProperty: 'flood_label',
    inputProperties: predictors.bandNames()
  });

// STEP 7: Train another classifier in LABEL mode for accuracy validation
var labelClassifier = ee.Classifier.smileRandomForest(100)
  .train({
    features: trainingPoints,
    classProperty: 'flood_label',
    inputProperties: predictors.bandNames()
  });

// STEP 8: Classify image using probability-mode classifier
// The result of classify in PROBABILITY mode for binary (0,1) RF is usually a single band
// with the probability of class '1'.
var floodProb = predictors.classify(probClassifier).clip(ROI);
// If probResult has multiple bands, you might need .select('probability') or similar.
// For smileRandomForest, it's typically the probability of the positive class (1).
// Assuming floodProb is now a single band image of probabilities [0,1].

// STEP 9: Create risk class map based on probability (5 classes)
// Class 0: Very Low, 1: Low, 2: Moderate, 3: High, 4: Very High
var riskMap = floodProb.expression(
  "(p <= 0.2) ? 0" +  // Very Low
  " : (p <= 0.4) ? 1" +  // Low
  " : (p <= 0.6) ? 2" +  // Moderate
  " : (p <= 0.8) ? 3" +  // High
  " : 4", {             // Very High
    'p': floodProb
}).rename("risk_class").toByte().clip(ROI); // toByte() to save space for integer classes

// STEP 10: Display risk map with updated palette
Map.centerObject(ROI, 9); // Adjusted zoom slightly

// Define visualization parameters for the combined risk map
var riskVisParams = {
  min: 0, // Very Low
  max: 4, // Very High
  palette: ['#2c7bb6', '#abd9e9', '#ffffbf', '#fdae61', '#d7191c'] // Blue, Cyan, Yellow, Orange, Red
};

// Add the full risk map with the correct color palette
Map.addLayer(riskMap, riskVisParams, "Flood Susceptibility (All Classes)");

// Create and display separate layers for each of the 5 classes
// Use .selfMask() to make pixels outside the class transparent
var veryLowDisplay = riskMap.eq(0).selfMask().clip(ROI);
var lowDisplay = riskMap.eq(1).selfMask().clip(ROI);
var moderateDisplay = riskMap.eq(2).selfMask().clip(ROI);
var highDisplay = riskMap.eq(3).selfMask().clip(ROI);
var veryHighDisplay = riskMap.eq(4).selfMask().clip(ROI);

// Add layers for each risk class to the map, showing only that class
Map.addLayer(veryLowDisplay, {palette: [riskVisParams.palette[0]]}, "Very Low Risk (Isolated)", false);
Map.addLayer(lowDisplay, {palette: [riskVisParams.palette[1]]}, "Low Risk (Isolated)", false);
Map.addLayer(moderateDisplay, {palette: [riskVisParams.palette[2]]}, "Moderate Risk (Isolated)", false);
Map.addLayer(highDisplay, {palette: [riskVisParams.palette[3]]}, "High Risk (Isolated)", false);
Map.addLayer(veryHighDisplay, {palette: [riskVisParams.palette[4]]}, "Very High Risk (Isolated)", false);

// STEP 11: Add legend for 5 classes
var legend = ui.Panel({
  style: {
    position: 'bottom-left',
    padding: '8px 12px',
    border: '1px solid black'
  }
});
legend.add(ui.Label('Flood Susceptibility', {fontWeight: 'bold', fontSize: '14px'}));

var legendItems = [
  {color: riskVisParams.palette[0], name: 'Very Low (0-20%)'},
  {color: riskVisParams.palette[1], name: 'Low (20-40%)'},
  {color: riskVisParams.palette[2], name: 'Moderate (40-60%)'},
  {color: riskVisParams.palette[3], name: 'High (60-80%)'},
  {color: riskVisParams.palette[4], name: 'Very High (>80%)'}
];

legendItems.forEach(function(item) {
  var colorBox = ui.Label('', {
    backgroundColor: item.color,
    padding: '8px',
    margin: '0 0 4px 0'
  });
  var description = ui.Label(item.name, {margin: '0 0 4px 6px', fontSize: '12px'});
  var row = ui.Panel([colorBox, description], ui.Panel.Layout.Flow('horizontal'));
  legend.add(row);
});
Map.add(legend);

// STEP 12: Accuracy assessment using label-based classifier (for binary flood/non-flood)
var validated = testingPoints.classify(labelClassifier);
var confMatrix = validated.errorMatrix('flood_label', 'classification');
print('▶ Confusion Matrix (0=Non-Flood, 1=Flood):', confMatrix);
print('▶ Overall Accuracy:', confMatrix.accuracy());
print('▶ Kappa Coefficient:', confMatrix.kappa());

// Extract values from confusion matrix for detailed metrics
// Rows: Actual, Columns: Predicted. Class 0: Non-Flood, Class 1: Flood.
var matrixArray = confMatrix.array();
var tn = ee.Number(matrixArray.get([0, 0])); // True Negatives (Actual Non-Flood, Predicted Non-Flood)
var fp = ee.Number(matrixArray.get([0, 1])); // False Positives (Actual Non-Flood, Predicted Flood)
var fn = ee.Number(matrixArray.get([1, 0])); // False Negatives (Actual Flood, Predicted Non-Flood)
var tp = ee.Number(matrixArray.get([1, 1])); // True Positives (Actual Flood, Predicted Flood)

print('  True Negatives (TN):', tn);
print('  False Positives (FP):', fp);
print('  False Negatives (FN):', fn);
print('  True Positives (TP):', tp);

// Precision for Flood Class (Class 1)
var precision = tp.divide(tp.add(fp));
precision = ee.Number(ee.Algorithms.If(tp.add(fp).eq(0), 0, precision)); // Avoid division by zero
print('▶ Precision (Flood "User\'s Accuracy"): TP / (TP + FP)', precision);

// Recall (Sensitivity or True Positive Rate) for Flood Class (Class 1)
var recall = tp.divide(tp.add(fn));
recall = ee.Number(ee.Algorithms.If(tp.add(fn).eq(0), 0, recall)); // Avoid division by zero
print('▶ Recall (Sensitivity, Flood "Producer\'s Accuracy"): TP / (TP + FN)', recall);

// F1-Score for Flood Class (Class 1)
var f1Score = precision.multiply(recall).multiply(2).divide(precision.add(recall));
f1Score = ee.Number(ee.Algorithms.If(precision.add(recall).eq(0), 0, f1Score)); // Avoid division by zero
print('▶ F1-Score (Flood):', f1Score);

// Specificity (True Negative Rate) for Non-Flood Class (Class 0)
var specificity = tn.divide(tn.add(fp)); // TN / (TN + FP)
specificity = ee.Number(ee.Algorithms.If(tn.add(fp).eq(0), 0, specificity));
print('▶ Specificity (Non-Flood): TN / (TN + FP)', specificity);

// False Positive Rate (FPR)
var fpr = fp.divide(fp.add(tn)); // FP / (FP + TN)
fpr = ee.Number(ee.Algorithms.If(fp.add(tn).eq(0), 0, fpr));
print('▶ False Positive Rate (FPR): FP / (FP + TN)', fpr);

// False Negative Rate (FNR)
var fnr = fn.divide(fn.add(tp)); // FN / (FN + TP)
fnr = ee.Number(ee.Algorithms.If(fn.add(tp).eq(0), 0, fnr));
print('▶ False Negative Rate (FNR): FN / (FN + TP)', fnr);

// Producer's and User's (Consumer's) Accuracy from GEE
// For class 0 (Non-Flood) and class 1 (Flood)
// Producer's Accuracy: For a given class, how often are real features on the ground correctly shown on the map.
// (Correctly_Classified_Pixels_Of_Class_X / Total_Pixels_Of_Class_X_In_Reference_Data - Column-wise)
print('▶ Producer\'s Accuracy (Non-Flood, Flood):', confMatrix.producersAccuracy().slice(0));
// User's Accuracy: For a given class on the map, how often does it actually represent that category on the ground.
// (Correctly_Classified_Pixels_Of_Class_X / Total_Pixels_Of_Class_X_In_Classified_Map - Row-wise)
print('▶ User\'s Accuracy (Non-Flood, Flood):', confMatrix.consumersAccuracy().slice(0));


// STEP 13: Export final result
Export.image.toDrive({
  image: riskMap, // Exporting the 5-class integer map
  description: "Flood_Susceptibility_RF_Sylhet_5Class",
  folder: "GEE_Exports",
  region: ROI.geometry(),
  scale: 30,
  maxPixels: 1e13,
  crs: 'EPSG:4326' // Example: Define CRS if needed
});

// Optional: Export probability map
Export.image.toDrive({
  image: floodProb, // Exporting the continuous probability map
  description: "Flood_Probability_RF_Sylhet",
  folder: "GEE_Exports",
  region: ROI.geometry(),
  scale: 30,
  maxPixels: 1e13,
  crs: 'EPSG:4326'
});


// STEP 13: Export each separated class (Very Low, Low, Moderate, High, Very High)

// Export "Very Low Risk" class
Export.image.toDrive({
  image: veryLowDisplay,  // Very Low Risk class
  description: "Very_Low_Risk_Sylhet",
  folder: "GEE_Exports",
  region: ROI.geometry(),
  scale: 30,
  maxPixels: 1e13,
  crs: 'EPSG:4326' // Optional: Define CRS if needed
});

// Export "Low Risk" class
Export.image.toDrive({
  image: lowDisplay,  // Low Risk class
  description: "Low_Risk_Sylhet",
  folder: "GEE_Exports",
  region: ROI.geometry(),
  scale: 30,
  maxPixels: 1e13,
  crs: 'EPSG:4326' // Optional: Define CRS if needed
});

// Export "Moderate Risk" class
Export.image.toDrive({
  image: moderateDisplay,  // Moderate Risk class
  description: "Moderate_Risk_Sylhet",
  folder: "GEE_Exports",
  region: ROI.geometry(),
  scale: 30,
  maxPixels: 1e13,
  crs: 'EPSG:4326' // Optional: Define CRS if needed
});

// Export "High Risk" class
Export.image.toDrive({
  image: highDisplay,  // High Risk class
  description: "High_Risk_Sylhet",
  folder: "GEE_Exports",
  region: ROI.geometry(),
  scale: 30,
  maxPixels: 1e13,
  crs: 'EPSG:4326' // Optional: Define CRS if needed
});

// Export "Very High Risk" class
Export.image.toDrive({
  image: veryHighDisplay,  // Very High Risk class
  description: "Very_High_Risk_Sylhet",
  folder: "GEE_Exports",
  region: ROI.geometry(),
  scale: 30,
  maxPixels: 1e13,
  crs: 'EPSG:4326' // Optional: Define CRS if needed
});


// STEP: Calculate mean flood susceptibility (probability) across the ROI
var meanFloodSusceptibility = floodProb.reduceRegion({
  reducer: ee.Reducer.mean(),  // Use the mean reducer to get the average value
  geometry: ROI.geometry(),  // Specify the region of interest (ROI)
  scale: 30,  // Set the scale to 30 meters, matching the resolution of the image
  maxPixels: 1e13  // Allow a large number of pixels to be processed
});

// Print the mean flood susceptibility value
print('▶ Mean Flood Susceptibility:', meanFloodSusceptibility);
