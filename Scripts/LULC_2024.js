// Define ROI (Sylhet Division)
var ROI = ee.FeatureCollection("projects/ee-monirirsgis/assets/Sylhet_Division");
Map.addLayer(ROI, {color: 'red'}, 'ROI');
Map.centerObject(ROI, 8);

// Load Landsat 8 TOA data
var collection = ee.ImageCollection("LANDSAT/LC08/C02/T1_TOA")
  .filterBounds(ROI)
  .filterDate('2024-01-01', '2024-12-31')
  .filter(ee.Filter.lt('CLOUD_COVER', 5));  // Cloud cover < 5%

print('Number of images:', collection.size());

if (collection.size().getInfo() > 0) {
  var image = collection.median().clip(ROI);
  
  // True Color (B4=Red, B3=Green, B2=Blue)
  Map.addLayer(image, {
    bands: ['B4', 'B3', 'B2'],
    min: 0.01,  // TOA values typically need lower min/max
    max: 0.25,
    gamma: 1.3   // Adjusts brightness mid-tones
  }, 'Landsat 8 TOA');
  
  print('Available bands:', image.bandNames());
} else {
  print('No images found. Try relaxing date/filters.');
}
// Assign numeric class values to each feature
var assignClass = function(feature, classValue) {
  return feature.set('class', classValue);
};

// Assign class values: 0 for Waterbody, 1 for Built-Up Area, etc.
Waterbody = Waterbody.map(function(f) { return assignClass(f, 0); });
Built_Up_Area = Built_Up_Area.map(function(f) { return assignClass(f, 1); });
Agriculture = Agriculture.map(function(f) { return assignClass(f, 2); });
Vegetation = Vegetation.map(function(f) { return assignClass(f, 3); });
Bareland = Bareland.map(function(f) { return assignClass(f, 4); });

// Merge all training points together
var sample = Waterbody.merge(Built_Up_Area)
  .merge(Agriculture)
  .merge(Vegetation)
  .merge(Bareland)
  .limit(5000); // Limit the number of points for training

print('Merged Training Data:', sample);
// Define the bands to use for classification
var bands = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'];

// Sample the image at training points with the selected bands
var training = image.select(bands).sampleRegions({
  collection: sample, // Training points collection
  properties: ['class'], // The 'class' property (numeric class labels)
  scale: 30,  // Landsat resolution
  tileScale: 4  // Improve performance for large datasets
});

print('Training Data:', training);
// Add a random column to split data into training and validation datasets
var dataset = training.randomColumn('random');

// Split the dataset into 70% training and 30% validation
var trainingData = dataset.filter(ee.Filter.lt('random', 0.7));
var validationData = dataset.filter(ee.Filter.gte('random', 0.7));

print('Training Data:', trainingData);
print('Validation Data:', validationData);
// Train a Random Forest classifier with 100 trees
var classifier = ee.Classifier.smileRandomForest(100).train({
  features: trainingData,
  classProperty: 'class',  // The 'class' label
  inputProperties: bands  // The bands to use for classification
});

print('Classifier:', classifier);
// Classify the image using the trained classifier
var classified = image.select(bands).classify(classifier);

// Define a color palette for LULC classes (adjust the colors as needed)
var classPalette = [
  '1b0ad6', // Waterbody (Blue)
  '#808080', // Built-Up Area (Gray)
  'fffe3c', // Agricultural Land (Yellow)
  '0f8b10', // Vegetation (Green)
  'd63000', // Barren Land (Red)
];

// Visualization parameters for classified image
var classVisParams = {
  min: 0,
  max: 4,  // 5 classes (0-4)
  palette: classPalette
};

// Add the classified image layer to the map
Map.addLayer(classified, classVisParams, 'Classified Image');
// Classify the validation dataset
var validation = validationData.classify(classifier);

// Calculate the error matrix
var accuracy = validation.errorMatrix('class', 'classification');
print('Validation Error Matrix:', accuracy);
print('Overall Accuracy:', accuracy.accuracy());
// Rename for clarity 
var classifiedLULC = classified.rename('LULC_Classification');

// Export the classified image to Earth Engine Asset
Export.image.toAsset({
  image: classifiedLULC.clip(ROI),  // Ensure it’s within your ROI
  description: 'Export_LULC_Classification_Sylhet2024',
  assetId: 'projects/ee-monirirsgis/assets/Thesis/LULC_Classification_Sylhet_2024',
  region: ROI.geometry(),
  scale: 30,
  maxPixels: 1e13
});


// Export Built-Up Area to Earth Engine Asset
var builtUpArea = classified.eq(1);  // Assuming '1' corresponds to Built-Up Area
Export.image.toAsset({
  image: builtUpArea.clip(ROI),  // Clip to the ROI (Sylhet Division)
  description: 'Export_Built_Up_Area_Sylhet2024',
  assetId: 'projects/ee-monirirsgis/assets/Thesis/Built_Up_Area_Sylhet_2024',
  region: ROI.geometry(),
  scale: 30,
  maxPixels: 1e13
});

// Get confusion matrix
var accuracy = validation.errorMatrix('class', 'classification');

// Print the confusion matrix
print('Confusion Matrix:', accuracy);
// Assume 'validation' is an ee.FeatureCollection with actual ('class') and predicted ('classification') properties.
// Assume 'class' and 'classification' properties contain 0 (e.g., non-flood) and 1 (e.g., flood).
// Assume 'validation' is an ee.FeatureCollection with actual ('class') and predicted ('classification') properties.
// Assume 'class' and 'classification' properties contain 0 (e.g., non-flood) and 1 (e.g., flood).

// --- Step 1: Calculate the Error Matrix (Confusion Matrix) ---
// This matrix shows how actual classes were classified.
// Rows typically represent actual classes, columns represent predicted classes.
var errorMatrix = validation.errorMatrix('class', 'classification');

// Print the raw error matrix object for inspection
print('Confusion Matrix (ErrorMatrix object):', errorMatrix);

// --- Step 2: Extract the Confusion Matrix as an Array ---
// The array format makes it easier to access individual cells.
// By default, GEE's errorMatrix.array() orders rows and columns by class value (e.g., 0 then 1).
// So, matrix.get([actual_class_index, predicted_class_index])
// Example: matrix.get([0,0]) is Actual 0, Predicted 0
//          matrix.get([0,1]) is Actual 0, Predicted 1
//          matrix.get([1,0]) is Actual 1, Predicted 0
//          matrix.get([1,1]) is Actual 1, Predicted 1
var matrixArray = errorMatrix.array();
print('Confusion Matrix (Array format):', matrixArray);

// --- Step 3: Define Components for Metrics (Assuming Class 1 is Positive, e.g., "Flood") ---
// True Positives (TP): Actual Class 1, Predicted Class 1
var tp = ee.Number(matrixArray.get([1, 1]));

// False Positives (FP): Actual Class 0, Predicted Class 1 (Type I error)
var fp = ee.Number(matrixArray.get([0, 1]));

// False Negatives (FN): Actual Class 1, Predicted Class 0 (Type II error)
var fn = ee.Number(matrixArray.get([1, 0]));

// True Negatives (TN): Actual Class 0, Predicted Class 0
var tn = ee.Number(matrixArray.get([0, 0]));

print('--- Metrics for Class 1 (e.g., Flood) as Positive ---');
print('True Positives (TP - Actual 1, Predicted 1):', tp);
print('False Positives (FP - Actual 0, Predicted 1):', fp);
print('False Negatives (FN - Actual 1, Predicted 0):', fn);
print('True Negatives (TN - Actual 0, Predicted 0):', tn);

// --- Step 4: Calculate Standard Metrics ---

// Overall Accuracy: (TP + TN) / (TP + TN + FP + FN)
// GEE provides a direct method for this.
var overallAccuracy = errorMatrix.accuracy();
print('Overall Accuracy:', overallAccuracy);

// Kappa Coefficient: A statistic that measures inter-rater agreement for qualitative (categorical) items.
var kappa = errorMatrix.kappa();
print('Kappa Coefficient:', kappa); // Your reported Kappa: 0.926... is very high!

// Precision (Positive Predictive Value) for Class 1: TP / (TP + FP)
var precisionDenominator = tp.add(fp);
var precision = ee.Number(ee.Algorithms.If(
  precisionDenominator.eq(0),    // Condition: if denominator is 0
  ee.Number(0),                  // Value if true: precision is 0
  tp.divide(precisionDenominator)  // Value if false: calculate precision
));
print('Precision (for Class 1):', precision);

// Recall (Sensitivity, True Positive Rate) for Class 1: TP / (TP + FN)
var recallDenominator = tp.add(fn);
var recall = ee.Number(ee.Algorithms.If(
  recallDenominator.eq(0),       // Condition: if denominator is 0
  ee.Number(0),                  // Value if true: recall is 0
  tp.divide(recallDenominator)     // Value if false: calculate recall
));
print('Recall (Sensitivity, for Class 1):', recall);

// F1-Score for Class 1: 2 * (Precision * Recall) / (Precision + Recall)
var f1ScoreDenominator = precision.add(recall);
var f1Score = ee.Number(ee.Algorithms.If(
  f1ScoreDenominator.eq(0),      // Condition: if (precision + recall) is 0
  ee.Number(0),                  // Value if true: F1-score is 0
  ee.Number(2).multiply(precision).multiply(recall).divide(f1ScoreDenominator) // Standard F1 formula
));
print('F1-Score (for Class 1):', f1Score);

// --- Optional: Metrics for Class 0 (e.g., Non-Flood) as Positive ---
var tp_C0 = tn; // Actual 0, Predicted 0 becomes TP for Class 0
var fp_C0 = fn; // Actual 1, Predicted 0 becomes FP for Class 0
var fn_C0 = fp; // Actual 0, Predicted 1 becomes FN for Class 0

print('--- Metrics for Class 0 (e.g., Non-Flood) as Positive ---');
var precision_C0_Denominator = tp_C0.add(fp_C0);
var precision_C0 = ee.Number(ee.Algorithms.If(
  precision_C0_Denominator.eq(0),
  ee.Number(0),
  tp_C0.divide(precision_C0_Denominator)
));
print('Precision (for Class 0):', precision_C0);

var recall_C0_Denominator = tp_C0.add(fn_C0);
var recall_C0 = ee.Number(ee.Algorithms.If(
  recall_C0_Denominator.eq(0),
  ee.Number(0),
  tp_C0.divide(recall_C0_Denominator)
));
print('Recall (Sensitivity, for Class 0):', recall_C0);

var f1Score_C0_Denominator = precision_C0.add(recall_C0);
var f1Score_C0 = ee.Number(ee.Algorithms.If(
  f1Score_C0_Denominator.eq(0),
  ee.Number(0),
  ee.Number(2).multiply(precision_C0).multiply(recall_C0).divide(f1Score_C0_Denominator)
));
print('F1-Score (for Class 0):', f1Score_C0);

